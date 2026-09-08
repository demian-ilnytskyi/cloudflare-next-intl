import { existsSync, readFileSync } from "node:fs";

export interface FirebaseAuthConfigIssue {
    /** Dotted config path, e.g. `firebaseAuth.appCheck.privateKey`. */
    field: string;
    severity: "error" | "warning";
    /** What is wrong, in one sentence. */
    reason: string;
    /** `process.env.X` name behind the field, when the config reads one. */
    envVar?: string;
    lineNumber?: number;
}

export interface CheckFirebaseAuthConfigOptions {
    /** Path to the file exporting `setIntlConfig({...})` (the `@intl-config` target). */
    intlConfigPath?: string;
    /** Pre-read source, used instead of reading `intlConfigPath` from disk. */
    source?: string;
    /**
     * Env values the config's `process.env.X` reads resolve against —
     * `process.env` merged with Vite's `loadEnv` result. A field whose env
     * var is missing here is reported as unset.
     */
    env?: Record<string, string | undefined>;
    throwOnError?: boolean;
}

export interface CheckFirebaseAuthConfigReport {
    valid: boolean;
    /** `false` when the config has no `firebaseAuth` block at all — nothing to check. */
    checked: boolean;
    issues: FirebaseAuthConfigIssue[];
    formattedMessage: string;
}

// Fields `firebase_auth` cannot work without: `initializeServerApp` and the
// client SDK both reject an empty `apiKey`/`projectId`/`appId`, and the
// middleware compares `redirectAuthPath`/`homePath` against the pathname on
// every request. `authDomain` is required for the OAuth/redirect handlers.
const REQUIRED_AUTH_FIELDS = [
    "apiKey",
    "authDomain",
    "projectId",
    "appId",
    "redirectAuthPath",
    "homePath",
] as const;

// `appCheck` is optional as a whole, but once present these are what
// server-side minting needs — see `mintServerAppCheckToken`.
const REQUIRED_APP_CHECK_FIELDS = ["clientEmail", "appId"] as const;
const OAUTH_TRIPLE = ["oauthClientId", "oauthClientSecret", "oauthRefreshToken"] as const;

/**
 * Extracts the `{...}` object literal that follows `key:` in `source`,
 * starting from the first `{` after the key (so `key: cond ? { ... } :
 * undefined` yields the same literal) and brace-matching to its end while
 * skipping strings, template literals, and comments. Returns `null` when
 * the key is absent or its value is not an object literal.
 */
export function extractObjectLiteral(
    source: string,
    key: string,
): { body: string; start: number } | null {
    const keyMatch = new RegExp(`(^|[\\s{,])${key}\\s*:`).exec(source);
    if (!keyMatch) return null;

    const afterKey = keyMatch.index + keyMatch[0].length;
    const open = source.indexOf("{", afterKey);
    if (open === -1) return null;
    // A `{` belonging to a LATER key (`firebaseAuth: undefined,` followed by
    // an unrelated object) is not this key's literal: the value ended at the
    // comma or statement break in between.
    if (/[,;]/.test(source.slice(afterKey, open))) return null;

    let depth = 0;
    let index = open;
    let quote: string | null = null;
    let comment: "line" | "block" | null = null;

    while (index < source.length) {
        const char = source[index]!;
        const next = source[index + 1];

        if (comment === "line") {
            if (char === "\n") comment = null;
        } else if (comment === "block") {
            if (char === "*" && next === "/") {
                comment = null;
                index += 1;
            }
        } else if (quote) {
            if (char === "\\") index += 1;
            else if (char === quote) quote = null;
        } else if (char === "/" && next === "/") {
            comment = "line";
            index += 1;
        } else if (char === "/" && next === "*") {
            comment = "block";
            index += 1;
        } else if (char === '"' || char === "'" || char === "`") {
            quote = char;
        } else if (char === "{") {
            depth += 1;
        } else if (char === "}") {
            depth -= 1;
            if (depth === 0) {
                return { body: source.slice(open + 1, index), start: open };
            }
        }
        index += 1;
    }

    return null;
}

/**
 * Reads the raw value text of `key` inside a single object literal body,
 * stopping at the comma/newline that ends it and skipping nested
 * objects/arrays/strings. Returns `null` when the key isn't present at this
 * level (nested occurrences are not matched).
 */
export function extractFieldValue(body: string, key: string): { value: string; lineNumber: number } | null {
    const keyMatch = new RegExp(`(^|[\\s{,])${key}\\s*:`).exec(body);
    if (!keyMatch) return null;
    const start = keyMatch.index + keyMatch[0].length;

    let index = start;
    let depth = 0;
    let quote: string | null = null;

    while (index < body.length) {
        const char = body[index]!;
        if (quote) {
            if (char === "\\") index += 1;
            else if (char === quote) quote = null;
        } else if (char === '"' || char === "'" || char === "`") {
            quote = char;
        } else if (char === "{" || char === "[" || char === "(") {
            depth += 1;
        } else if (char === "}" || char === "]" || char === ")") {
            if (depth === 0) break;
            depth -= 1;
        } else if (char === "," && depth === 0) {
            break;
        }
        index += 1;
    }

    return {
        value: body.slice(start, index).trim(),
        lineNumber: body.slice(0, start).split("\n").length,
    };
}

/** `process.env.FOO` / `process.env["FOO"]` names read by `value`. */
function envVarsIn(value: string): string[] {
    const names: string[] = [];
    const pattern = /process\.env\s*(?:\.\s*([A-Za-z_$][\w$]*)|\[\s*["'`]([^"'`]+)["'`]\s*\])/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(value)) !== null) {
        const name = match[1] ?? match[2];
        if (name) names.push(name);
    }
    return names;
}

/**
 * Decides whether a field's value text can actually produce a non-empty
 * string at runtime. Only two shapes are judged unusable: an empty/whitespace
 * literal (`''`), and a value whose ONLY source is `process.env` vars that
 * are all absent/empty in `env`. Anything else (a call, an imported
 * constant, a ternary) is treated as fine — a static scan can't evaluate it,
 * and guessing would produce false alarms.
 */
function evaluateValue(
    value: string,
    env: Record<string, string | undefined>,
): { ok: true } | { ok: false; reason: string; envVar?: string } {
    if (value === "" || value === "undefined" || value === "null") {
        return { ok: false, reason: "set to `" + (value || "nothing") + "`" };
    }

    const literal = /^(["'`])(.*)\1$/s.exec(value);
    if (literal && literal[2]!.trim() === "") {
        return { ok: false, reason: "an empty string literal" };
    }
    if (literal) return { ok: true };

    const envVars = envVarsIn(value);
    if (envVars.length === 0) return { ok: true };

    // `A ?? B`, `A || B` and a ternary can each fall back to something this
    // scan can't see, so only flag when EVERY env var in the value is unset
    // and there is no non-env fallback text left over.
    const withoutEnv = value.replace(/process\.env\s*(?:\.\s*[A-Za-z_$][\w$]*|\[\s*["'`][^"'`]+["'`]\s*\])/g, "");
    const hasFallback = /[A-Za-z0-9_$"'`]/.test(withoutEnv.replace(/\bas\b|\bstring\b|\bundefined\b|\bnull\b/g, ""));
    const unset = envVars.filter((name) => !env[name] || env[name]!.trim() === "");
    if (unset.length === envVars.length && !hasFallback) {
        return {
            ok: false,
            reason: "read from `process.env." + unset[0] + "`, which is not set",
            envVar: unset[0],
        };
    }

    return { ok: true };
}

function checkField(
    body: string,
    path: string,
    key: string,
    severity: FirebaseAuthConfigIssue["severity"],
    env: Record<string, string | undefined>,
    baseLine: number,
): FirebaseAuthConfigIssue | null {
    const field = `${path}.${key}`;
    const found = extractFieldValue(body, key);
    if (!found) {
        return { field, severity, reason: "missing from the config" };
    }
    const verdict = evaluateValue(found.value, env);
    if (verdict.ok) return null;
    return {
        field,
        severity,
        reason: verdict.reason,
        ...(verdict.envVar ? { envVar: verdict.envVar } : {}),
        lineNumber: baseLine + found.lineNumber - 1,
    };
}

export function formatFirebaseAuthConfigMessage(
    issues: FirebaseAuthConfigIssue[],
    intlConfigPath?: string,
): string {
    if (issues.length === 0) return "";

    const separator = "=".repeat(84);
    const thinSeparator = "-".repeat(84);
    const errors = issues.filter((issue) => issue.severity === "error");

    const lines: string[] = [
        "",
        separator,
        errors.length > 0
            ? "🚨 [cloudflare-next-intl] INCOMPLETE `firebaseAuth` CONFIG"
            : "⚠️  [cloudflare-next-intl] INCOMPLETE `firebaseAuth` CONFIG",
        separator,
        "",
    ];

    if (intlConfigPath) lines.push("📄 Config: " + intlConfigPath, "");
    lines.push("📋 ISSUES FOUND (" + issues.length + "):", thinSeparator);

    issues.forEach((issue, index) => {
        const icon = issue.severity === "error" ? "❌" : "⚠️ ";
        lines.push(` [${index + 1}] ${icon} ${issue.field} — ${issue.reason}`);
        if (issue.envVar) {
            lines.push(`     Set ${issue.envVar} in your .env / Cloudflare secrets.`);
        }
        if (issue.lineNumber) {
            lines.push(`     Around line ${issue.lineNumber}.`);
        }
        lines.push(thinSeparator);
    });

    lines.push(
        "",
        "💡 WHAT BREAKS OTHERWISE:",
        "   • Missing core fields (apiKey / authDomain / projectId / appId): the Firebase SDK",
        "     rejects init, so every sign-in and every server-side session lookup fails.",
        "   • Missing redirectAuthPath / homePath: the middleware's guest and auth-page",
        "     redirects never match a pathname and silently do nothing.",
        "   • Incomplete appCheck server credentials (clientEmail + appId, plus privateKey OR the",
        "     full oauthClientId/oauthClientSecret/oauthRefreshToken triple): a signed-in user",
        "     renders as signed-out on any cold navigation that beats the client's App Check cookie.",
        "     Silence just this one with `appCheck.reportMissingServerCredentials: false`.",
        "",
        separator,
        "",
    );

    return lines.join("\n");
}

/**
 * Statically validates the `firebaseAuth` block of the `@intl-config` file,
 * so a missing service-account value or an unset env var surfaces during
 * `vite dev` / `vite build` instead of as a runtime "signed-out" mystery in
 * production. Source-text analysis, not evaluation: the config file reads
 * `process.env` at module scope and imports app code, so it can't be
 * imported from a plugin — fields are located in the object literal and
 * their `process.env.X` reads are resolved against `options.env`.
 *
 * Deliberately conservative — a value this scan cannot evaluate (a call, an
 * imported constant, a `??` fallback) is treated as present. Only an empty
 * literal, a `undefined`/`null` value, an absent key, and a value whose only
 * source is unset env vars are reported. Returns `checked: false` when the
 * config has no `firebaseAuth` at all.
 */
export function checkFirebaseAuthConfig(
    options: CheckFirebaseAuthConfigOptions = {},
): CheckFirebaseAuthConfigReport {
    const env = options.env ?? process.env;
    let source = options.source;
    if (source === undefined) {
        const path = options.intlConfigPath;
        if (!path || !existsSync(path)) {
            return { valid: true, checked: false, issues: [], formattedMessage: "" };
        }
        try {
            source = readFileSync(path, "utf8");
        } catch {
            return { valid: true, checked: false, issues: [], formattedMessage: "" };
        }
    }

    const firebaseAuth = extractObjectLiteral(source, "firebaseAuth");
    if (!firebaseAuth) {
        return { valid: true, checked: false, issues: [], formattedMessage: "" };
    }

    const baseLine = source.slice(0, firebaseAuth.start).split("\n").length;
    const issues: FirebaseAuthConfigIssue[] = [];

    for (const key of REQUIRED_AUTH_FIELDS) {
        const issue = checkField(firebaseAuth.body, "firebaseAuth", key, "error", env, baseLine);
        if (issue) issues.push(issue);
    }

    const appCheck = extractObjectLiteral(firebaseAuth.body, "appCheck");
    if (appCheck) {
        const appCheckLine = baseLine + firebaseAuth.body.slice(0, appCheck.start).split("\n").length - 1;
        const optedOut = /reportMissingServerCredentials\s*:\s*false/.test(appCheck.body);

        if (!optedOut) {
            for (const key of REQUIRED_APP_CHECK_FIELDS) {
                const issue = checkField(appCheck.body, "firebaseAuth.appCheck", key, "warning", env, appCheckLine);
                if (issue) issues.push(issue);
            }

            const privateKey = checkField(appCheck.body, "firebaseAuth.appCheck", "privateKey", "warning", env, appCheckLine);
            const triple = OAUTH_TRIPLE.map((key) =>
                checkField(appCheck.body, "firebaseAuth.appCheck", key, "warning", env, appCheckLine));
            // Either signing credential alone is enough, so only report when
            // NEITHER is usable — and then report the one the config clearly
            // meant to use (a partial triple) rather than both.
            if (privateKey && triple.some((issue) => issue !== null)) {
                const partialTriple = triple.some((issue) => issue === null);
                if (partialTriple) {
                    issues.push(...triple.filter((issue): issue is FirebaseAuthConfigIssue => issue !== null));
                } else {
                    issues.push({
                        ...privateKey,
                        reason: privateKey.reason
                            + " — set it, or the full oauthClientId/oauthClientSecret/oauthRefreshToken triple",
                    });
                }
            }
        }
    }

    const valid = !issues.some((issue) => issue.severity === "error");
    const formattedMessage = formatFirebaseAuthConfigMessage(issues, options.intlConfigPath);

    if (!valid && options.throwOnError) {
        throw new Error(formattedMessage);
    }

    return { valid, checked: true, issues, formattedMessage };
}
