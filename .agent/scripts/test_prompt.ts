#!/usr/bin/env npx tsx
/**
 * Test the current MAIN_clarivant_EXTRACTION_PROMPT against arbitrary text.
 *
 * Usage:
 *   GEMINI_API_KEY=<key> npx tsx .agent/scripts/test_prompt.ts "<doc text>"
 *   GEMINI_API_KEY=<key> npx tsx .agent/scripts/test_prompt.ts --file path/to/doc.txt
 *
 * Optional env vars:
 *   BUCKETS_CONTEXT  — raw JSON string of buckets (defaults to a minimal Identity bucket)
 *   USER_TIMEZONE    — IANA timezone (default: America/New_York)
 */

import { readFileSync } from "fs";
import { MAIN_clarivant_EXTRACTION_PROMPT } from "../../cloudflare/workflow/src/prompts";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error("Error: GEMINI_API_KEY env var is required");
  process.exit(1);
}

const args = process.argv.slice(2);
let docText: string;
if (args[0] === "--file") {
  docText = readFileSync(args[1], "utf8");
} else if (args[0]) {
  docText = args[0];
} else {
  console.error("Usage: test_prompt.ts '<text>' | --file <path>");
  process.exit(1);
}

const userTimezone = process.env.USER_TIMEZONE ?? "America/New_York";
const bucketsCtx = process.env.BUCKETS_CONTEXT ?? JSON.stringify({
  bucket_id: 9,
  bucket_name: "Identity",
  example_documents: [
    {
      id: 91,
      document_name: "Driver License",
      required_fields: ["expiration_date", "license_number"],
      additional_fields: ["issue_date", "date_of_birth", "license_class"],
    },
  ],
});

const SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING", nullable: true },
    organization_name: { type: "STRING", nullable: true },
    fields: {
      type: "ARRAY",
      nullable: true,
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          value: { type: "STRING", nullable: true },
          type: {
            type: "STRING",
            enum: ["date", "date_time", "number", "price", "reach", "text"],
          },
        },
        required: ["title", "value", "type"],
      },
    },
    rrule: { type: "STRING", nullable: true },
    start_time: { type: "STRING", nullable: true },
    end_time: { type: "STRING", nullable: true },
    duration: { type: "INTEGER", nullable: true },
    primary_keywords: {
      type: "ARRAY",
      items: { type: "STRING" },
      nullable: true,
    },
    secondary_keywords: {
      type: "ARRAY",
      items: { type: "STRING" },
      nullable: true,
    },
    bucket_id: { type: "INTEGER", nullable: true },
    doc_id: { type: "INTEGER", nullable: true },
    microhint: { type: "STRING", nullable: true },
    is_relevant: { type: "BOOLEAN" },
    is_retryable: { type: "BOOLEAN" },
    rejection_reason: { type: "STRING", nullable: true },
  },
  required: [
    "title",
    "organization_name",
    "fields",
    "primary_keywords",
    "secondary_keywords",
    "rrule",
    "start_time",
    "end_time",
    "duration",
    "bucket_id",
    "doc_id",
    "microhint",
    "is_relevant",
    "is_retryable",
    "rejection_reason",
  ],
};

async function main() {
  const systemPrompt = MAIN_clarivant_EXTRACTION_PROMPT(
    new Date().toISOString(),
    userTimezone,
    bucketsCtx,
  );

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `${systemPrompt}\n\nCONTENT TO ANALYZE:\n${docText}`,
          }],
        }],
        generationConfig: {
          response_mime_type: "application/json",
          response_schema: SCHEMA,
          temperature: 0,
        },
      }),
    },
  );

  if (!res.ok) {
    console.error("Gemini error:", res.status, await res.text());
    process.exit(1);
  }

  const j = await res.json() as any;
  const raw = j.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) {
    console.error("Empty response");
    process.exit(1);
  }

  const parsed = JSON.parse(raw);
  console.log(JSON.stringify(parsed, null, 2));
  console.error(
    `\nTokens: prompt=${j.usageMetadata?.promptTokenCount} out=${j.usageMetadata?.candidatesTokenCount} total=${j.usageMetadata?.totalTokenCount}`,
  );
}

main();
