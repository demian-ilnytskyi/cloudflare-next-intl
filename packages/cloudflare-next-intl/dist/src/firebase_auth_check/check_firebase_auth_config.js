import { existsSync, readFileSync } from "node:fs";
const REQUIRED_AUTH_FIELDS = [
    "apiKey",
    "authDomain",
    "projectId",
    "appId",
    "redirectAuthPath",
    "homePath",
];
const REQUIRED_APP_CHECK_FIELDS = ["clientEmail", "appId"];
const OAUTH_TRIPLE = ["oauthClientId", "oauthClientSecret", "oauthRefreshToken"];
export function extractObjectLiteral(source, key) {
    const keyMatch = new RegExp(`(^|[\\s{,])${key}\\s*:`).exec(source);
    if (!keyMatch)
        return null;
    const afterKey = keyMatch.index + keyMatch[0].length;
    const open = source.indexOf("{", afterKey);
    if (open === -1)
        return null;
    if (/[,;]/.test(source.slice(afterKey, open)))
        return null;
    let depth = 0;
    let index = open;
    let quote = null;
    let comment = null;
    while (index < source.length) {
        const char = source[index];
        const next = source[index + 1];
        if (comment === "line") {
            if (char === "\n")
                comment = null;
        }
        else if (comment === "block") {
            if (char === "*" && next === "/") {
                comment = null;
                index += 1;
            }
        }
        else if (quote) {
            if (char === "\\")
                index += 1;
            else if (char === quote)
                quote = null;
        }
        else if (char === "/" && next === "/") {
            comment = "line";
            index += 1;
        }
        else if (char === "/" && next === "*") {
            comment = "block";
            index += 1;
        }
        else if (char === '"' || char === "'" || char === "`") {
            quote = char;
        }
        else if (char === "{") {
            depth += 1;
        }
        else if (char === "}") {
            depth -= 1;
            if (depth === 0) {
                return { body: source.slice(open + 1, index), start: open };
            }
        }
        index += 1;
    }
    return null;
}
export function extractFieldValue(body, key) {
    const keyMatch = new RegExp(`(^|[\\s{,])${key}\\s*:`).exec(body);
    if (!keyMatch)
        return null;
    const start = keyMatch.index + keyMatch[0].length;
    let index = start;
    let depth = 0;
    let quote = null;
    while (index < body.length) {
        const char = body[index];
        if (quote) {
            if (char === "\\")
                index += 1;
            else if (char === quote)
                quote = null;
        }
        else if (char === '"' || char === "'" || char === "`") {
            quote = char;
        }
        else if (char === "{" || char === "[" || char === "(") {
            depth += 1;
        }
        else if (char === "}" || char === "]" || char === ")") {
            if (depth === 0)
                break;
            depth -= 1;
        }
        else if (char === "," && depth === 0) {
            break;
        }
        index += 1;
    }
    return {
        value: body.slice(start, index).trim(),
        lineNumber: body.slice(0, start).split("\n").length,
    };
}
function envVarsIn(value) {
    const names = [];
    const pattern = /process\.env\s*(?:\.\s*([A-Za-z_$][\w$]*)|\[\s*["'`]([^"'`]+)["'`]\s*\])/g;
    let match;
    while ((match = pattern.exec(value)) !== null) {
        const name = match[1] ?? match[2];
        if (name)
            names.push(name);
    }
    return names;
}
function evaluateValue(value, env) {
    if (value === "" || value === "undefined" || value === "null") {
        return { ok: false, reason: "set to `" + (value || "nothing") + "`" };
    }
    const literal = /^(["'`])(.*)\1$/s.exec(value);
    if (literal && literal[2].trim() === "") {
        return { ok: false, reason: "an empty string literal" };
    }
    if (literal)
        return { ok: true };
    const envVars = envVarsIn(value);
    if (envVars.length === 0)
        return { ok: true };
    const withoutEnv = value.replace(/process\.env\s*(?:\.\s*[A-Za-z_$][\w$]*|\[\s*["'`][^"'`]+["'`]\s*\])/g, "");
    const hasFallback = /[A-Za-z0-9_$"'`]/.test(withoutEnv.replace(/\bas\b|\bstring\b|\bundefined\b|\bnull\b/g, ""));
    const unset = envVars.filter((name) => !env[name] || env[name].trim() === "");
    if (unset.length === envVars.length && !hasFallback) {
        return {
            ok: false,
            reason: "read from `process.env." + unset[0] + "`, which is not set",
            envVar: unset[0],
        };
    }
    return { ok: true };
}
function checkField(body, path, key, severity, env, baseLine) {
    const field = `${path}.${key}`;
    const found = extractFieldValue(body, key);
    if (!found) {
        return { field, severity, reason: "missing from the config" };
    }
    const verdict = evaluateValue(found.value, env);
    if (verdict.ok)
        return null;
    return {
        field,
        severity,
        reason: verdict.reason,
        ...(verdict.envVar ? { envVar: verdict.envVar } : {}),
        lineNumber: baseLine + found.lineNumber - 1,
    };
}
export function formatFirebaseAuthConfigMessage(issues, intlConfigPath) {
    if (issues.length === 0)
        return "";
    const separator = "=".repeat(84);
    const thinSeparator = "-".repeat(84);
    const errors = issues.filter((issue) => issue.severity === "error");
    const lines = [
        "",
        separator,
        errors.length > 0
            ? "🚨 [cloudflare-next-intl] INCOMPLETE `firebaseAuth` CONFIG"
            : "⚠️  [cloudflare-next-intl] INCOMPLETE `firebaseAuth` CONFIG",
        separator,
        "",
    ];
    if (intlConfigPath)
        lines.push("📄 Config: " + intlConfigPath, "");
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
    lines.push("", "💡 WHAT BREAKS OTHERWISE:", "   • Missing core fields (apiKey / authDomain / projectId / appId): the Firebase SDK", "     rejects init, so every sign-in and every server-side session lookup fails.", "   • Missing redirectAuthPath / homePath: the middleware's guest and auth-page", "     redirects never match a pathname and silently do nothing.", "   • Incomplete appCheck server credentials (clientEmail + appId, plus privateKey OR the", "     full oauthClientId/oauthClientSecret/oauthRefreshToken triple): a signed-in user", "     renders as signed-out on any cold navigation that beats the client's App Check cookie.", "     Silence just this one with `appCheck.reportMissingServerCredentials: false`.", "", separator, "");
    return lines.join("\n");
}
export function checkFirebaseAuthConfig(options = {}) {
    const env = options.env ?? process.env;
    let source = options.source;
    if (source === undefined) {
        const path = options.intlConfigPath;
        if (!path || !existsSync(path)) {
            return { valid: true, checked: false, issues: [], formattedMessage: "" };
        }
        try {
            source = readFileSync(path, "utf8");
        }
        catch {
            return { valid: true, checked: false, issues: [], formattedMessage: "" };
        }
    }
    const firebaseAuth = extractObjectLiteral(source, "firebaseAuth");
    if (!firebaseAuth) {
        return { valid: true, checked: false, issues: [], formattedMessage: "" };
    }
    const baseLine = source.slice(0, firebaseAuth.start).split("\n").length;
    const issues = [];
    for (const key of REQUIRED_AUTH_FIELDS) {
        const issue = checkField(firebaseAuth.body, "firebaseAuth", key, "error", env, baseLine);
        if (issue)
            issues.push(issue);
    }
    const appCheck = extractObjectLiteral(firebaseAuth.body, "appCheck");
    if (appCheck) {
        const appCheckLine = baseLine + firebaseAuth.body.slice(0, appCheck.start).split("\n").length - 1;
        const optedOut = /reportMissingServerCredentials\s*:\s*false/.test(appCheck.body);
        if (!optedOut) {
            for (const key of REQUIRED_APP_CHECK_FIELDS) {
                const issue = checkField(appCheck.body, "firebaseAuth.appCheck", key, "warning", env, appCheckLine);
                if (issue)
                    issues.push(issue);
            }
            const privateKey = checkField(appCheck.body, "firebaseAuth.appCheck", "privateKey", "warning", env, appCheckLine);
            const triple = OAUTH_TRIPLE.map((key) => checkField(appCheck.body, "firebaseAuth.appCheck", key, "warning", env, appCheckLine));
            if (privateKey && triple.some((issue) => issue !== null)) {
                const partialTriple = triple.some((issue) => issue === null);
                if (partialTriple) {
                    issues.push(...triple.filter((issue) => issue !== null));
                }
                else {
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
