#!/usr/bin/env python3
"""Generate the buckets_doc_example.additional_fields seed migration.

The live DB has 75 consolidated doc types (ids 1-75). Their bucket_id and
primary_keywords are defined in
  20260527142913_add_keyword_fields_to_buckets_doc_example.sql
The CSV ("clarivant AI BRAIN ENGINE...") holds 164 finer-grained rows, each with a
"Key Fields" column. We map every DB id to the best-matching CSV row by keyword
overlap (within the same bucket), then emit:
    UPDATE buckets_doc_example SET additional_fields = ARRAY[...] WHERE id = N;
A final pass subtracts required_fields so additional_fields stays unique.
"""
import csv
import re

CSV_PATH = "clarivant AI BRAIN ENGINE-MAY 2026 V1 1(Master AI Engine).csv"
OUT_PATH = "supabase/migrations/20260603120000_add_additional_fields_to_buckets_doc_example.sql"

# CSV bucket name -> DB bucket_id (from the keyword migration comments).
BUCKET_ID = {
    "Money": 1, "Health": 2, "Home": 3, "Work": 4, "Auto": 5, "Legal": 6,
    "Travel": 7, "Education": 8, "Subscriptions": 9, "Family": 10,
    "Immigration": 11, "Insurance": 12, "Business": 13, "Pets": 14, "Misc": 15,
}

# id -> (bucket_id, primary_keywords) parsed from the keyword migration.
# primary_keywords drive the CSV-row match.
ID_KEYWORDS = {
    1: (1, ["credit card statement", "card statement", "credit card bill"]),
    2: (1, ["bank statement", "account statement"]),
    3: (1, ["monthly bill", "amount due", "bill payment", "service bill"]),
    4: (1, ["W-2", "1099", "tax return", "wage statement"]),
    5: (1, ["invoice", "billed amount", "personal invoice"]),
    6: (1, ["receipt", "purchase receipt", "refund confirmation"]),
    7: (1, ["subscription charge", "recurring payment", "auto-renewal charge"]),
    8: (2, ["appointment", "scheduled visit", "doctor appointment"]),
    9: (2, ["prescription", "prescribed medication", "refill notice"]),
    10: (2, ["medical bill", "hospital bill", "patient statement", "medical invoice"]),
    11: (2, ["claim submitted", "insurance claim", "filed claim"]),
    12: (2, ["lab result", "test result", "blood test"]),
    13: (2, ["immunization", "vaccine record", "vaccination"]),
    14: (3, ["mortgage", "loan agreement", "mortgage statement"]),
    15: (3, ["rent statement", "rent bill", "lease agreement"]),
    16: (3, ["utility bill", "electric bill", "water bill"]),
    17: (3, ["home repair invoice", "home service invoice", "home maintenance", "contractor invoice"]),
    18: (3, ["HOA", "homeowners association"]),
    19: (3, ["homeowners insurance payment", "home insurance bill", "home insurance renewal"]),
    20: (4, ["employment contract", "offer letter", "job offer"]),
    21: (4, ["HR form", "employee form", "benefits summary"]),
    22: (4, ["work schedule", "shift schedule"]),
    23: (4, ["license", "certification", "certified"]),
    24: (4, ["NDA", "non disclosure agreement", "company correspondence"]),
    25: (5, ["ticket", "traffic ticket", "toll violation"]),
    26: (5, ["insurance card", "proof of insurance", "liability card"]),
    27: (5, ["vehicle registration", "registration", "plate", "vehicle title"]),
    28: (5, ["auto repair", "vehicle repair", "mechanic invoice", "car service record"]),
    29: (5, ["parking permit", "decal", "driver license"]),
    30: (5, ["inspection report", "vehicle inspection", "recall notice"]),
    31: (6, ["legal contract", "signed agreement", "legal agreement"]),
    32: (6, ["legal letter", "attorney letter", "legal notice", "cease and desist"]),
    33: (6, ["court order", "court filing", "lawsuit", "complaint"]),
    34: (6, ["power of attorney", "POA", "will", "last will", "trust"]),
    35: (6, ["EIN", "LLC formation", "incorporation", "business license"]),
    36: (7, ["flight confirmation", "booking reference"]),
    37: (7, ["hotel booking", "reservation", "cruise booking"]),
    38: (7, ["itinerary", "travel plan", "car rental"]),
    39: (7, ["TSA PreCheck", "known traveler number", "global entry"]),
    40: (7, ["travel insurance", "coverage policy"]),
    41: (8, ["transcript", "academic transcript", "diploma"]),
    42: (8, ["academic certificate", "certificate of completion", "continuing education"]),
    43: (8, ["enrollment", "course registration", "FAFSA"]),
    44: (8, ["tuition bill", "tuition statement", "student loan"]),
    45: (8, ["transcript", "academic record", "scholarship", "IEP"]),
    46: (9, ["subscription receipt", "payment confirmation"]),
    47: (9, ["subscription invoice", "subscription billing", "upcoming charge"]),
    48: (9, ["subscription confirmation", "sign up", "membership agreement"]),
    49: (9, ["plan summary", "subscription plan", "cancellation confirmation"]),
    50: (10, ["school record", "report card", "camp registration"]),
    51: (10, ["sports schedule", "activity registration", "camp registration"]),
    52: (10, ["medical record", "pediatric record", "family appointment"]),
    53: (10, ["custody agreement", "custody order", "child support"]),
    54: (11, ["visa", "visa approval", "green card"]),
    55: (11, ["USCIS receipt", "receipt notice", "EAD", "work permit"]),
    56: (11, ["passport", "naturalization", "citizenship certificate", "certificate of citizenship"]),
    57: (11, ["appointment notice", "USCIS interview", "biometrics"]),
    58: (11, ["immigration attorney letter", "immigration notice", "case update", "USCIS letter"]),
    59: (12, ["health insurance", "medical coverage"]),
    60: (12, ["car insurance", "auto insurance policy"]),
    61: (12, ["home insurance", "homeowners policy", "renters insurance"]),
    62: (12, ["life insurance", "beneficiary policy", "disability insurance"]),
    63: (12, ["renewal notice", "policy renewal", "insurance renewal"]),
    64: (13, ["business invoice", "invoice", "billed amount"]),
    65: (13, ["business receipt", "expense report", "reimbursement"]),
    66: (13, ["business contract", "vendor agreement", "client contract"]),
    67: (13, ["vendor payment", "supplier contract"]),
    68: (13, ["business tax filing", "corporate tax", "1099-NEC", "business tax return"]),
    69: (14, ["vet visit", "veterinary record", "grooming record"]),
    70: (14, ["vaccination record", "vaccine", "shot record"]),
    71: (14, ["pet insurance", "animal coverage"]),
    72: (14, ["pet prescription", "vet prescription", "medication record"]),
    73: (15, ["document", "file", "general reminder"]),
    74: (15, ["document", "file"]),
    75: (15, ["other document", "miscellaneous"]),
}


def norm(s):
    return re.sub(r"[^a-z0-9 ]", " ", s.lower()).split()


def load_csv():
    """Return list of dicts: {bucket_id, doc, tokens, key_fields:[..]}."""
    rows = []
    with open(CSV_PATH, encoding="utf-8", errors="replace") as f:
        r = csv.reader(f)
        header = next(r)
        for line in r:
            if not line or not line[0].strip():
                continue
            bucket = line[0].strip()
            bid = BUCKET_ID.get(bucket)
            if bid is None:
                continue
            doc = line[2].strip()
            prim = line[3]
            sec = line[4]
            key_fields_raw = line[6]
            required_raw = line[7] if len(line) > 7 else ""
            tokens = set(norm(doc) + norm(prim) + norm(sec))
            kf = [x.strip() for x in key_fields_raw.split(",") if x.strip()]
            rf = [x.strip() for x in required_raw.split(",") if x.strip()]
            rows.append({
                "bucket_id": bid, "doc": doc, "tokens": tokens,
                "key_fields": kf, "required_fields": rf,
            })
    return rows


def best_match(bid, keywords, csv_rows):
    """Pick the CSV row in the same bucket with the most keyword-token overlap."""
    kw_tokens = set()
    for k in keywords:
        kw_tokens |= set(norm(k))
    best, best_score = None, -1
    for row in csv_rows:
        if row["bucket_id"] != bid:
            continue
        score = len(kw_tokens & row["tokens"])
        if score > best_score:
            best, best_score = row, score
    return best


def sql_array(items):
    if not items:
        return "ARRAY[]::text[]"
    esc = ", ".join("'" + x.replace("'", "''") + "'" for x in items)
    return f"ARRAY[{esc}]"


def main():
    csv_rows = load_csv()
    lines = [
        "-- Seed required_fields and additional_fields on buckets_doc_example from",
        "-- the clarivant AI BRAIN spreadsheet:",
        "--   required_fields   <- CSV 'Required Fields' column (the doc-type's",
        "--                        primary label set).",
        "--   additional_fields <- CSV 'Key Fields' column (granular data points),",
        "--                        kept UNIQUE vs required_fields (no overlap).",
        "-- The AI extracts these and returns a sorted [{title,value,type}] array.",
        "-- Generated by scripts/gen_additional_fields_migration.py",
        "",
        "ALTER TABLE public.buckets_doc_example",
        "  ADD COLUMN IF NOT EXISTS required_fields   text[] DEFAULT '{}',",
        "  ADD COLUMN IF NOT EXISTS additional_fields text[] DEFAULT '{}';",
        "",
    ]
    for cid in range(1, 76):
        bid, kws = ID_KEYWORDS[cid]
        m = best_match(bid, kws, csv_rows)
        kf = m["key_fields"] if m else []
        rf = m["required_fields"] if m else []
        doc = m["doc"] if m else "?"
        lines.append(f"-- id={cid} bucket={bid} <= CSV \"{doc}\"")
        lines.append(
            f"UPDATE public.buckets_doc_example SET "
            f"required_fields = {sql_array(rf)}, "
            f"additional_fields = {sql_array(kf)} WHERE id = {cid};"
        )
    lines += [
        "",
        "-- Enforce uniqueness vs required_fields: drop any additional_fields",
        "-- entry that already appears in required_fields for that row.",
        "UPDATE public.buckets_doc_example bde SET additional_fields = COALESCE((",
        "    SELECT array_agg(af)",
        "    FROM unnest(bde.additional_fields) AS af",
        "    WHERE af <> ALL (COALESCE(bde.required_fields, ARRAY[]::text[]))",
        "  ), ARRAY[]::text[])",
        "WHERE bde.additional_fields IS NOT NULL;",
        "",
    ]
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"wrote {OUT_PATH} ({len(lines)} lines)")


if __name__ == "__main__":
    main()
