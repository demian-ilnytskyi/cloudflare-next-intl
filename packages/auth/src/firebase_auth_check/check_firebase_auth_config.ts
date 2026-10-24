import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";

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
 * Brace-matches a `{...}` literal starting at `open` (the index of its `{`),
 * skipping strings, template literals, and comments. Returns `null` when the
 * brace at `open` never closes.
 */
function matchBraceLiteral(source: string, open: number): { body: string; start: number } | null {
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
 * Same length as `text`, with every character inside a comment or a
 * string/template literal replaced by a space (newlines kept, so line
 * numbers computed from the result still line up). Lets a `key:` search use
 * a plain regex without matching text that only *looks* like a key because
 * it's commented out or quoted — e.g. `// apiKey: 'x',` or `homePath: "a: b"`.
 */
function maskCommentsAndStrings(text: string): string {
    let result = "";
    let quote: string | null = null;
    let comment: "line" | "block" | null = null;

    for (let index = 0; index < text.length; index += 1) {
        const char = text[index]!;
        const next = text[index + 1];

        if (comment === "line") {
            result += char === "\n" ? "\n" : " ";
            if (char === "\n") comment = null;
        } else if (comment === "block") {
            if (char === "*" && next === "/") {
                result += "  ";
                comment = null;
                index += 1;
            } else {
                result += char === "\n" ? "\n" : " ";
            }
        } else if (quote) {
            if (char === "\\") {
                result += "  ";
                index += 1;
            } else {
                result += char === "\n" ? "\n" : " ";
                if (char === quote) quote = null;
            }
        } else if (char === "/" && next === "/") {
            comment = "line";
            result += "  ";
            index += 1;
        } else if (char === "/" && next === "*") {
            comment = "block";
            result += "  ";
            index += 1;
        } else if (char === '"' || char === "'" || char === "`") {
            quote = char;
            result += " ";
        } else {
            result += char;
        }
    }

    return result;
}

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
    const masked = maskCommentsAndStrings(source);
    const keyMatch = new RegExp(`(^|[\\s{,])${key}\\s*:`).exec(masked);
    if (!keyMatch) return null;

    const afterKey = keyMatch.index + keyMatch[0].length;
    const open = masked.indexOf("{", afterKey);
    if (open === -1) return null;
    // A `{` belonging to a LATER key (`firebaseAuth: undefined,` followed by
    // an unrelated object) is not this key's literal: the value ended at the
    // comma or statement break in between.
    if (/[,;]/.test(masked.slice(afterKey, open))) return null;

    return matchBraceLiteral(source, open);
}

/**
 * Extracts the `{...}` object literal assigned to a top-level
 * `const NAME = {...}` (optionally `export`ed, optionally type-annotated)
 * in `source`. Used to resolve what a `...NAME` spread inside a
 * `firebaseAuth`/`appCheck` literal actually contributes.
 */
function extractAssignedObjectLiteral(source: string, name: string): { body: string; start: number } | null {
    const masked = maskCommentsAndStrings(source);
    const declMatch = new RegExp(`(?:^|[\\s;}])(?:export\\s+)?(?:const|let|var)\\s+${name}\\b[^=;]*=`).exec(masked);
    if (!declMatch) return null;

    const afterEq = declMatch.index + declMatch[0].length;
    const open = masked.indexOf("{", afterEq);
    if (open === -1) return null;
    if (/[;\n]\S/.test(masked.slice(afterEq, open))) return null;

    return matchBraceLiteral(source, open);
}

/**
 * Names spread (`...name`) at the top level of an object literal `body`
 * (not inside a nested object/array/call), in source order.
 */
function findTopLevelSpreadNames(body: string): string[] {
    const names: string[] = [];
    let depth = 0;
    let quote: string | null = null;
    let comment: "line" | "block" | null = null;

    for (let index = 0; index < body.length; index += 1) {
        const char = body[index]!;
        const next = body[index + 1];

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
        } else if (char === "{" || char === "[" || char === "(") {
            depth += 1;
        } else if (char === "}" || char === "]" || char === ")") {
            depth -= 1;
        } else if (depth === 0 && char === "." && next === "." && body[index + 2] === ".") {
            const nameMatch = /^([A-Za-z_$][\w$]*)/.exec(body.slice(index + 3));
            if (nameMatch) names.push(nameMatch[1]!);
            index += 2;
        }
    }

    return names;
}

const RESOLVE_EXTENSIONS = [".ts", ".tsx", ".mts", ".js", ".jsx", ".mjs"];

interface TsconfigAliases {
    baseDir: string;
    paths: Record<string, string[]>;
}

const tsconfigAliasCache = new Map<string, TsconfigAliases | null>();

/** Strips line and block comments and trailing commas so a tsconfig.json can go through `JSON.parse`. */
function stripJsonComments(text: string): string {
    let stripped = "";
    let inString = false;

    for (let index = 0; index < text.length; index += 1) {
        const char = text[index]!;
        const next = text[index + 1];

        if (inString) {
            stripped += char;
            if (char === "\\") {
                stripped += next ?? "";
                index += 1;
            } else if (char === '"') {
                inString = false;
            }
            continue;
        }

        if (char === '"') {
            inString = true;
            stripped += char;
        } else if (char === "/" && next === "/") {
            while (index < text.length && text[index] !== "\n") index += 1;
            stripped += "\n";
        } else if (char === "/" && next === "*") {
            index += 2;
            while (index < text.length && !(text[index] === "*" && text[index + 1] === "/")) index += 1;
            index += 1;
        } else {
            stripped += char;
        }
    }

    // A JSON-with-comments file (tsconfig.json) commonly has a trailing
    // comma left behind after a `// ...` line is dropped; JSON.parse rejects
    // that, so clean it up too.
    return stripped.replace(/,(\s*[}\]])/g, "$1");
}

/** Nearest `tsconfig.json`'s `compilerOptions.paths` (if any), walking up from `fromDir`. */
function findTsconfigAliases(fromDir: string): TsconfigAliases | null {
    if (tsconfigAliasCache.has(fromDir)) return tsconfigAliasCache.get(fromDir)!;

    let dir = fromDir;
    let result: TsconfigAliases | null = null;
    for (let depth = 0; depth < 12; depth += 1) {
        const candidate = resolvePath(dir, "tsconfig.json");
        if (existsSync(candidate)) {
            try {
                const parsed = JSON.parse(stripJsonComments(readFileSync(candidate, "utf8")));
                const paths = parsed?.compilerOptions?.paths;
                if (paths && typeof paths === "object") {
                    result = { baseDir: resolvePath(dir, parsed?.compilerOptions?.baseUrl ?? "."), paths };
                }
            } catch {
                result = null;
            }
            break;
        }
        const parent = dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }

    tsconfigAliasCache.set(fromDir, result);
    return result;
}

/** Maps an aliased specifier (`@/shared/x`) to a filesystem path via the nearest tsconfig's `paths`. */
function resolveAliasSpecifier(fromFile: string, specifier: string): string | null {
    const aliases = findTsconfigAliases(dirname(fromFile));
    if (!aliases) return null;

    for (const [pattern, targets] of Object.entries(aliases.paths)) {
        const target = targets[0];
        if (!target) continue;
        if (pattern.endsWith("/*") && specifier.startsWith(pattern.slice(0, -1))) {
            return resolvePath(aliases.baseDir, target.slice(0, -1) + specifier.slice(pattern.length - 1));
        }
        if (pattern === specifier) {
            return resolvePath(aliases.baseDir, target);
        }
    }
    return null;
}

/** Resolves a relative or tsconfig-aliased import specifier to a readable file. */
function resolveModuleFile(fromFile: string, specifier: string): string | null {
    const target = specifier.startsWith(".")
        ? resolvePath(dirname(fromFile), specifier)
        : resolveAliasSpecifier(fromFile, specifier);
    if (!target) return null;

    for (const candidate of [target, ...RESOLVE_EXTENSIONS.map((ext) => target + ext)]) {
        if (existsSync(candidate)) return candidate;
    }
    return null;
}

/** The imported name and module specifier behind a local `import { X as name } from "..."`. */
function findNamedImportSpecifier(source: string, localName: string): { imported: string; from: string } | null {
    const importRegex = /import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
    let match: RegExpExecArray | null;
    while ((match = importRegex.exec(source)) !== null) {
        for (const raw of match[1]!.split(",")) {
            const spec = raw.trim();
            if (!spec) continue;
            const asMatch = /^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/.exec(spec);
            const imported = asMatch ? asMatch[1]! : spec;
            const local = asMatch ? asMatch[2]! : spec;
            if (local === localName) return { imported, from: match[2]! };
        }
    }
    return null;
}

/**
 * Resolves what a `...name` spread contributes: a local `const name = {...}`
 * in the same file, or — when `fromFile` is a real path — one hop through a
 * relative named import into the file that defines it. Anything beyond that
 * (a non-relative import, a computed spread, a re-export chain) is left
 * unresolved rather than guessed at.
 */
function resolveSpreadBody(
    name: string,
    source: string,
    fromFile: string | undefined,
    cache: Map<string, string | null>,
): string | null {
    const cacheKey = `${fromFile ?? ""}::${name}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey)!;

    let result: string | null = extractAssignedObjectLiteral(source, name)?.body ?? null;

    if (result === null && fromFile) {
        const namedImport = findNamedImportSpecifier(source, name);
        if (namedImport) {
            const file = resolveModuleFile(fromFile, namedImport.from);
            if (file) {
                try {
                    const fileSource = readFileSync(file, "utf8");
                    result = extractAssignedObjectLiteral(fileSource, namedImport.imported)?.body ?? null;
                } catch {
                    result = null;
                }
            }
        }
    }

    cache.set(cacheKey, result);
    return result;
}

/**
 * All bodies to search for a field: `mainBody` itself, plus the resolved
 * body of every top-level spread inside it that could be resolved.
 * `hasUnresolvedSpread` is `true` when at least one spread name couldn't be
 * resolved — in that case a field absent from every resolved body still
 * isn't reported as missing, since the unresolved spread could supply it.
 */
function resolveSpreadBodies(
    mainBody: string,
    source: string,
    fromFile: string | undefined,
    cache: Map<string, string | null>,
): { bodies: string[]; hasUnresolvedSpread: boolean } {
    const bodies = [mainBody];
    let hasUnresolvedSpread = false;

    for (const name of findTopLevelSpreadNames(mainBody)) {
        const resolved = resolveSpreadBody(name, source, fromFile, cache);
        if (resolved !== null) bodies.push(resolved);
        else hasUnresolvedSpread = true;
    }

    return { bodies, hasUnresolvedSpread };
}

/**
 * Reads the raw value text of `key` inside a single object literal body,
 * stopping at the comma/newline that ends it and skipping nested
 * objects/arrays/strings. Returns `null` when the key isn't present at this
 * level (nested occurrences are not matched).
 */
export function extractFieldValue(body: string, key: string): { value: string; lineNumber: number } | null {
    const masked = maskCommentsAndStrings(body);
    const keyPattern = new RegExp(`^${key}\\s*:`);

    let searchDepth = 0;
    let scanIndex = 0;
    let keyMatch: RegExpExecArray | null = null;

    // A blind whole-body regex would happily match `key:` inside a NESTED
    // object literal too (e.g. `firebaseAuth.appCheck.appId` shadowing a
    // `firebaseAuth.appId` check) — depth-track so only a top-level
    // occurrence, relative to `body`'s own braces, counts.
    while (scanIndex < masked.length) {
        const char = masked[scanIndex]!;
        if (char === "{" || char === "[" || char === "(") {
            searchDepth += 1;
        } else if (char === "}" || char === "]" || char === ")") {
            searchDepth -= 1;
        } else if (searchDepth === 0 && (scanIndex === 0 || /[\s{,]/.test(masked[scanIndex - 1]!))) {
            const candidate = keyPattern.exec(masked.slice(scanIndex));
            if (candidate) {
                keyMatch = candidate;
                keyMatch.index = scanIndex;
                break;
            }
        }
        scanIndex += 1;
    }

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
    bodies: string[],
    hasUnresolvedSpread: boolean,
    path: string,
    key: string,
    severity: FirebaseAuthConfigIssue["severity"],
    env: Record<string, string | undefined>,
    baseLine: number,
): FirebaseAuthConfigIssue | null {
    const field = `${path}.${key}`;

    let found: { value: string; lineNumber: number } | null = null;
    let fromMainBody = false;
    for (let index = 0; index < bodies.length; index += 1) {
        found = extractFieldValue(bodies[index]!, key);
        if (found) {
            fromMainBody = index === 0;
            break;
        }
    }

    if (!found) {
        if (hasUnresolvedSpread) return null;
        return { field, severity, reason: "missing from the config" };
    }
    const verdict = evaluateValue(found.value, env);
    if (verdict.ok) return null;
    return {
        field,
        severity,
        reason: verdict.reason,
        ...(verdict.envVar ? { envVar: verdict.envVar } : {}),
        ...(fromMainBody ? { lineNumber: baseLine + found.lineNumber - 1 } : {}),
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
    const resolveCache = new Map<string, string | null>();

    const { bodies: authBodies, hasUnresolvedSpread: authHasUnresolvedSpread } =
        resolveSpreadBodies(firebaseAuth.body, source, options.intlConfigPath, resolveCache);

    for (const key of REQUIRED_AUTH_FIELDS) {
        const issue = checkField(authBodies, authHasUnresolvedSpread, "firebaseAuth", key, "error", env, baseLine);
        if (issue) issues.push(issue);
    }

    const appCheck = extractObjectLiteral(firebaseAuth.body, "appCheck");
    if (appCheck) {
        const appCheckLine = baseLine + firebaseAuth.body.slice(0, appCheck.start).split("\n").length - 1;
        const optedOut = /reportMissingServerCredentials\s*:\s*false/.test(maskCommentsAndStrings(appCheck.body));
        const { bodies: appCheckBodies, hasUnresolvedSpread: appCheckHasUnresolvedSpread } =
            resolveSpreadBodies(appCheck.body, source, options.intlConfigPath, resolveCache);

        if (!optedOut) {
            for (const key of REQUIRED_APP_CHECK_FIELDS) {
                const issue = checkField(
                    appCheckBodies, appCheckHasUnresolvedSpread, "firebaseAuth.appCheck", key, "warning", env, appCheckLine,
                );
                if (issue) issues.push(issue);
            }

            const privateKey = checkField(
                appCheckBodies, appCheckHasUnresolvedSpread, "firebaseAuth.appCheck", "privateKey", "warning", env, appCheckLine,
            );
            const triple = OAUTH_TRIPLE.map((key) =>
                checkField(
                    appCheckBodies, appCheckHasUnresolvedSpread, "firebaseAuth.appCheck", key, "warning", env, appCheckLine,
                ));
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

export interface ValidateFirebaseAuthConfigValuesOptions {
    /**
     * The REAL, evaluated `firebaseAuth` object — read off the `@intl-config`
     * module's default export after actually importing it (see
     * `loadResolvedFirebaseAuth`), not text parsed from source. `undefined`
     * means the config has no `firebaseAuth` block (or couldn't be loaded);
     * nothing to check either way.
     */
    firebaseAuth: Record<string, unknown> | undefined;
    /** Only used to label the report; no file is read. */
    intlConfigPath?: string;
}

function isUsableFieldValue(value: unknown): boolean {
    if (value === undefined || value === null) return false;
    if (typeof value === "string") return value.trim() !== "";
    return true;
}

const UNUSABLE_REASON = "resolved to an empty or missing value";

/**
 * Validates the ACTUAL `firebaseAuth` object the app's config evaluates to —
 * not its source text. Unlike `checkFirebaseAuthConfig` (a static scan that
 * has to GUESS which `process.env.X` a field reads by pattern-matching
 * source text — fragile against anything the scan can't see through, like a
 * same-named field nested one level deeper, or a value computed via a
 * non-trivial expression), this just reads the real, already-resolved
 * value: correct by construction, for any field however it's computed.
 *
 * Reports the same fields, with the same required/optional shape, as
 * `checkFirebaseAuthConfig` — but without a `lineNumber` or `envVar` (there's
 * no source position or env-var name to point at once the value is already
 * evaluated).
 */
export function validateFirebaseAuthConfigValues(
    options: ValidateFirebaseAuthConfigValuesOptions,
): CheckFirebaseAuthConfigReport {
    const { firebaseAuth } = options;
    if (!firebaseAuth) {
        return { valid: true, checked: false, issues: [], formattedMessage: "" };
    }

    const issues: FirebaseAuthConfigIssue[] = [];

    for (const key of REQUIRED_AUTH_FIELDS) {
        if (!isUsableFieldValue(firebaseAuth[key])) {
            issues.push({ field: `firebaseAuth.${key}`, severity: "error", reason: UNUSABLE_REASON });
        }
    }

    const appCheck = firebaseAuth.appCheck as Record<string, unknown> | undefined;
    if (appCheck && appCheck.reportMissingServerCredentials !== false) {
        for (const key of REQUIRED_APP_CHECK_FIELDS) {
            if (!isUsableFieldValue(appCheck[key])) {
                issues.push({ field: `firebaseAuth.appCheck.${key}`, severity: "warning", reason: UNUSABLE_REASON });
            }
        }

        const hasPrivateKey = isUsableFieldValue(appCheck.privateKey);
        const tripleUsable = OAUTH_TRIPLE.map((key) => isUsableFieldValue(appCheck[key]));
        const hasTriple = tripleUsable.every(Boolean);

        // Either signing credential alone is enough, so only report when
        // NEITHER is usable — and then report the one the config clearly
        // meant to use (a partial triple) rather than both.
        if (!hasPrivateKey && !hasTriple) {
            const hasPartialTriple = tripleUsable.some(Boolean);
            if (hasPartialTriple) {
                OAUTH_TRIPLE.forEach((key, index) => {
                    if (!tripleUsable[index]) {
                        issues.push({ field: `firebaseAuth.appCheck.${key}`, severity: "warning", reason: UNUSABLE_REASON });
                    }
                });
            } else {
                issues.push({
                    field: "firebaseAuth.appCheck.privateKey",
                    severity: "warning",
                    reason: UNUSABLE_REASON + " — set it, or the full oauthClientId/oauthClientSecret/oauthRefreshToken triple",
                });
            }
        }
    }

    const valid = !issues.some((issue) => issue.severity === "error");
    const formattedMessage = formatFirebaseAuthConfigMessage(issues, options.intlConfigPath);

    return { valid, checked: true, issues, formattedMessage };
}
