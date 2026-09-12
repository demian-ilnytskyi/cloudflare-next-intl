import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    checkFirebaseAuthConfig,
    extractFieldValue,
    extractObjectLiteral,
    formatFirebaseAuthConfigMessage,
    validateFirebaseAuthConfigValues,
} from "./check_firebase_auth_config.js";

const fullEnv = {
    NEXT_PUBLIC_FIREBASE_API_KEY: "key",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "app.firebaseapp.com",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: "proj",
    NEXT_PUBLIC_FIREBASE_APP_ID: "1:1:web:1",
    FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: "pem",
    FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL: "a@b.com",
    FIREBASE_APP_ID: "1:1:web:1",
};

const source = `
import { setIntlConfig } from "cloudflare-next-intl";
export default setIntlConfig({
    locales: ["en"] as const,
    defaultLocale: "en",
    firebaseAuth: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? {
        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
        appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
        redirectAuthPath: '/login',
        homePath: '/',
        isAuthPath: (path: string) => path === '/login',
        appCheck: {
            recaptchaV3SiteKey: process.env.NEXT_PUBLIC_RECAPTCHA_V3_SITE_KEY as string,
            privateKey: process.env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY!,
            clientEmail: process.env.FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL!,
            appId: process.env.FIREBASE_APP_ID!,
        },
    } : undefined,
    cookieConsent: { privacyPolicyDate: "2026-01-05" },
});
`;

describe("extractObjectLiteral", () => {
    it("returns the brace-matched literal behind a ternary and skips braces in strings/comments", () => {
        const found = extractObjectLiteral(source, "firebaseAuth");
        expect(found?.body).toContain("redirectAuthPath");
        expect(found?.body).not.toContain("privacyPolicyDate");
    });

    it("returns null when the key's value is not an object literal", () => {
        expect(extractObjectLiteral(`{ firebaseAuth: undefined, other: { a: 1 } }`, "firebaseAuth")).toBeNull();
        expect(extractObjectLiteral(`{ locales: ["en"] }`, "firebaseAuth")).toBeNull();
    });

    it("skips braces inside comments, strings, template literals, and escapes", () => {
        const tricky = `{
            firebaseAuth: {
                // a commented brace {
                /* and a block one } */
                homePath: "}",
                redirectAuthPath: '\\'}',
                apiKey: \`\${"}"}\`,
            },
            after: { x: 1 },
        }`;
        const found = extractObjectLiteral(tricky, "firebaseAuth");
        expect(found?.body).toContain("apiKey");
        expect(found?.body).not.toContain("after");
    });

    it("returns null when nothing after the key opens a literal", () => {
        expect(extractObjectLiteral(`firebaseAuth: sharedConfig`, "firebaseAuth")).toBeNull();
    });

    it("returns null when the literal is never closed", () => {
        expect(extractObjectLiteral(`{ firebaseAuth: { apiKey: 'k'`, "firebaseAuth")).toBeNull();
    });

    it("does not match a key that only appears as a suffix of another key", () => {
        expect(extractObjectLiteral(`{ myFirebaseAuth: { a: 1 } }`, "firebaseAuth")).toBeNull();
    });
});

describe("extractFieldValue", () => {
    it("stops at the comma that ends the value and skips nested structures", () => {
        const body = `a: fn({ x: 1 }, [2, 3]), b: 'two',`;
        expect(extractFieldValue(body, "a")?.value).toBe("fn({ x: 1 }, [2, 3])");
        expect(extractFieldValue(body, "b")?.value).toBe("'two'");
        expect(extractFieldValue(body, "c")).toBeNull();
    });

    it("keeps an escaped quote inside the value and stops at an unbalanced closer", () => {
        expect(extractFieldValue(`a: 'x\\'y', b: 1`, "a")?.value).toBe(`'x\\'y'`);
        expect(extractFieldValue(`a: 1 } trailing`, "a")?.value).toBe("1");
    });

    it("ignores a same-named key nested inside a child object literal and finds the top-level one instead", () => {
        const body = `appId: 'top-level', nested: { appId: 'shadowed' },`;
        expect(extractFieldValue(body, "appId")?.value).toBe("'top-level'");
    });

    it("returns null when the key only occurs nested, never at the top level of this body", () => {
        const body = `redirectAuthPath: '/login', appCheck: { appId: 'nested-only' },`;
        expect(extractFieldValue(body, "appId")).toBeNull();
    });
});

describe("checkFirebaseAuthConfig", () => {
    it("reports nothing for a fully configured block with every env var set", () => {
        const report = checkFirebaseAuthConfig({ source, env: fullEnv });
        expect(report).toMatchObject({ valid: true, checked: true, issues: [] });
        expect(report.formattedMessage).toBe("");
    });

    it("reports an error per required field read from an unset env var", () => {
        const report = checkFirebaseAuthConfig({
            source,
            env: { ...fullEnv, NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "", NEXT_PUBLIC_FIREBASE_PROJECT_ID: undefined },
        });
        expect(report.valid).toBe(false);
        expect(report.issues.map((issue) => issue.field)).toEqual([
            "firebaseAuth.authDomain",
            "firebaseAuth.projectId",
        ]);
        expect(report.issues[0]).toMatchObject({
            severity: "error",
            envVar: "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
        });
        expect(report.formattedMessage).toContain("INCOMPLETE `firebaseAuth` CONFIG");
    });

    it("reports missing and empty required fields", () => {
        const report = checkFirebaseAuthConfig({
            source: `setIntlConfig({ firebaseAuth: { apiKey: 'k', authDomain: 'd', projectId: 'p', appId: '', homePath: '/' } })`,
            env: {},
        });
        expect(report.issues).toEqual([
            { field: "firebaseAuth.appId", severity: "error", reason: "an empty string literal", lineNumber: 1 },
            { field: "firebaseAuth.redirectAuthPath", severity: "error", reason: "missing from the config" },
        ]);
    });

    it("reports a field explicitly set to undefined or null", () => {
        const report = checkFirebaseAuthConfig({
            source: `setIntlConfig({ firebaseAuth: {
                apiKey: undefined, authDomain: null, projectId: 'p', appId: 'a',
                redirectAuthPath: '/login', homePath: '/',
            } })`,
            env: {},
        });
        expect(report.issues.map((issue) => [issue.field, issue.reason])).toEqual([
            ["firebaseAuth.apiKey", "set to `undefined`"],
            ["firebaseAuth.authDomain", "set to `null`"],
        ]);
    });

    it("reports a field with no value at all, and reads bracketed process.env access", () => {
        const report = checkFirebaseAuthConfig({
            source: `setIntlConfig({ firebaseAuth: {
                apiKey: , authDomain: process.env["AUTH_DOMAIN"], projectId: 'p', appId: 'a',
                redirectAuthPath: '/login', homePath: '/',
            } })`,
            env: {},
        });
        expect(report.issues.map((issue) => [issue.field, issue.reason, issue.envVar])).toEqual([
            ["firebaseAuth.apiKey", "set to `nothing`", undefined],
            ["firebaseAuth.authDomain", "read from `process.env.AUTH_DOMAIN`, which is not set", "AUTH_DOMAIN"],
        ]);
    });

    it("warns per missing appCheck identity field", () => {
        const report = checkFirebaseAuthConfig({
            source: `setIntlConfig({ firebaseAuth: {
                apiKey: 'k', authDomain: 'd', projectId: 'p', appId: 'a',
                redirectAuthPath: '/login', homePath: '/',
                appCheck: { recaptchaV3SiteKey: 's', privateKey: 'pem' },
            } })`,
            env: {},
        });
        expect(report.valid).toBe(true);
        expect(report.issues.map((issue) => issue.field)).toEqual([
            "firebaseAuth.appCheck.clientEmail",
            "firebaseAuth.appCheck.appId",
        ]);
    });

    it("returns checked: false when the config path cannot be read", () => {
        const dir = mkdtempSync(join(tmpdir(), "fa-config-unreadable-"));
        try {
            // A directory passes `existsSync` but throws on `readFileSync`.
            expect(checkFirebaseAuthConfig({ intlConfigPath: dir })).toMatchObject({ valid: true, checked: false });
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("warns (never errors) when appCheck has no usable signing credential", () => {
        const report = checkFirebaseAuthConfig({
            source,
            env: { ...fullEnv, FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY: undefined },
        });
        expect(report.valid).toBe(true);
        expect(report.issues).toHaveLength(1);
        expect(report.issues[0]).toMatchObject({ field: "firebaseAuth.appCheck.privateKey", severity: "warning" });
        expect(report.issues[0]!.reason).toContain("oauthClientId/oauthClientSecret/oauthRefreshToken triple");
    });

    it("accepts the OAuth triple as the alternative to privateKey, and flags a partial one", () => {
        const withTriple = (extra: string) => `setIntlConfig({ firebaseAuth: {
            apiKey: 'k', authDomain: 'd', projectId: 'p', appId: 'a',
            redirectAuthPath: '/login', homePath: '/',
            appCheck: { clientEmail: 'a@b.com', appId: 'a', ${extra} },
        } })`;

        expect(checkFirebaseAuthConfig({
            source: withTriple("oauthClientId: 'i', oauthClientSecret: 's', oauthRefreshToken: 'r'"),
            env: {},
        }).issues).toEqual([]);

        const partial = checkFirebaseAuthConfig({
            source: withTriple("oauthClientId: 'i'"),
            env: {},
        });
        expect(partial.issues.map((issue) => issue.field)).toEqual([
            "firebaseAuth.appCheck.oauthClientSecret",
            "firebaseAuth.appCheck.oauthRefreshToken",
        ]);
        expect(partial.valid).toBe(true);
    });

    it("skips every appCheck warning when reportMissingServerCredentials is false", () => {
        const report = checkFirebaseAuthConfig({
            source: `setIntlConfig({ firebaseAuth: {
                apiKey: 'k', authDomain: 'd', projectId: 'p', appId: 'a',
                redirectAuthPath: '/login', homePath: '/',
                appCheck: { recaptchaV3SiteKey: 's', reportMissingServerCredentials: false },
            } })`,
            env: {},
        });
        expect(report.issues).toEqual([]);
    });

    it("treats fields supplied via an object spread as present, not missing", () => {
        const report = checkFirebaseAuthConfig({
            source: `setIntlConfig({ firebaseAuth: {
                ...firebaseConfig,
                redirectAuthPath: '/login', homePath: '/',
            } })`,
            env: {},
        });
        expect(report.issues).toEqual([]);
    });

    it("does not let firebaseAuth.appCheck.appId shadow the top-level firebaseAuth.appId check", () => {
        // Same shape as a real app: `appId` is supplied to the top-level
        // `firebaseAuth` block via an (unresolved-here) spread, and appCheck
        // separately reads its OWN `appId` from a server-only env var. A
        // blind first-match search for `appId:` finds the nested
        // `appCheck.appId` first and wrongly reports it as the top-level
        // field's source.
        const report = checkFirebaseAuthConfig({
            source: `setIntlConfig({ firebaseAuth: {
                ...firebaseConfig,
                redirectAuthPath: '/login', homePath: '/',
                appCheck: {
                    clientEmail: process.env.FIREBASE_SERVICE_ACCOUNT_CLIENT_EMAIL,
                    appId: process.env.FIREBASE_APP_ID,
                },
            } })`,
            env: { FIREBASE_APP_ID: undefined },
        });
        expect(report.issues.find((issue) => issue.field === "firebaseAuth.appId")).toBeUndefined();
    });

    it("does not mistake a commented-out field for a present one", () => {
        const report = checkFirebaseAuthConfig({
            source: `setIntlConfig({ firebaseAuth: {
                apiKey: 'k',
                // authDomain: 'd',
                /* projectId: 'p', */
                appId: 'a',
                redirectAuthPath: '/login', homePath: '/',
            } })`,
            env: {},
        });
        expect(report.issues.map((issue) => issue.field)).toEqual([
            "firebaseAuth.authDomain",
            "firebaseAuth.projectId",
        ]);
    });

    it("does not mistake `key:` text inside a string value for another field", () => {
        const report = checkFirebaseAuthConfig({
            source: `setIntlConfig({ firebaseAuth: {
                apiKey: 'k', authDomain: 'd', projectId: 'p', appId: 'a',
                redirectAuthPath: "path with homePath: not real", homePath: '/',
            } })`,
            env: {},
        });
        expect(report.issues).toEqual([]);
    });

    it("resolves a spread from a local const in the same source", () => {
        const report = checkFirebaseAuthConfig({
            source: `
                const firebaseConfig = { apiKey: 'k', authDomain: 'd', projectId: 'p', appId: 'a' };
                setIntlConfig({ firebaseAuth: {
                    ...firebaseConfig,
                    redirectAuthPath: '/login', homePath: '/',
                } })
            `,
            env: {},
        });
        expect(report.issues).toEqual([]);
    });

    it("resolves a spread through a relative named import, and still flags a genuinely empty field in it", () => {
        const dir = mkdtempSync(join(tmpdir(), "fa-config-spread-"));
        try {
            writeFileSync(
                join(dir, "firebase_config.ts"),
                `export const firebaseConfig = { apiKey: '', authDomain: 'd', projectId: 'p', appId: 'a' };`,
            );
            const file = join(dir, "intl_config.ts");
            writeFileSync(file, `
                import { firebaseConfig } from "./firebase_config";
                setIntlConfig({ firebaseAuth: {
                    ...firebaseConfig,
                    redirectAuthPath: '/login', homePath: '/',
                } })
            `);
            const report = checkFirebaseAuthConfig({ intlConfigPath: file, env: {} });
            expect(report.issues.map((issue) => issue.field)).toEqual(["firebaseAuth.apiKey"]);
            expect(report.issues[0]).toMatchObject({ reason: "an empty string literal" });
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("resolves a spread through a tsconfig `@/*` path alias, tolerating `**/*.ts`-style globs elsewhere in the file", () => {
        const dir = mkdtempSync(join(tmpdir(), "fa-config-alias-"));
        try {
            // A real tsconfig.json: `"@/*"` and `"**/*.ts"` each contain a
            // literal `/*` or `*/`, which a naive JSON-comment stripper
            // mistakes for a block comment spanning between them.
            writeFileSync(dir + "/tsconfig.json", `{
                "compilerOptions": {
                    // baseUrl comment
                    "baseUrl": ".",
                    "paths": { "@/*": ["./src/*"] }
                },
                "include": ["**/*.ts", "**/*.tsx"],
            }`);
            mkdirSync(dir + "/src/shared", { recursive: true });
            writeFileSync(
                dir + "/src/shared/firebase_config.ts",
                `export const firebaseConfig = { apiKey: '', authDomain: 'd', projectId: 'p', appId: 'a' };`,
            );
            const file = dir + "/src/l18n/intl_config.ts";
            mkdirSync(dir + "/src/l18n", { recursive: true });
            writeFileSync(file, `
                import { firebaseConfig } from "@/shared/firebase_config";
                setIntlConfig({ firebaseAuth: {
                    ...firebaseConfig,
                    redirectAuthPath: '/login', homePath: '/',
                } })
            `);
            const report = checkFirebaseAuthConfig({ intlConfigPath: file, env: {} });
            expect(report.issues.map((issue) => issue.field)).toEqual(["firebaseAuth.apiKey"]);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("still flags empty/undefined/null fields even when a spread is present", () => {
        const report = checkFirebaseAuthConfig({
            source: `setIntlConfig({ firebaseAuth: {
                ...firebaseConfig,
                apiKey: '', authDomain: undefined, projectId: null,
                redirectAuthPath: '/login', homePath: '/',
            } })`,
            env: {},
        });
        expect(report.issues.map((issue) => [issue.field, issue.reason])).toEqual([
            ["firebaseAuth.apiKey", "an empty string literal"],
            ["firebaseAuth.authDomain", "set to `undefined`"],
            ["firebaseAuth.projectId", "set to `null`"],
        ]);
    });

    it("treats a value it cannot evaluate as present", () => {
        const report = checkFirebaseAuthConfig({
            source: `setIntlConfig({ firebaseAuth: {
                apiKey: env.KEY, authDomain: buildDomain(), projectId: process.env.PID ?? 'fallback',
                appId: KConstants.appId, redirectAuthPath: '/login', homePath: '/',
            } })`,
            env: {},
        });
        expect(report.issues).toEqual([]);
    });

    it("returns checked: false when there is no firebaseAuth block or no readable file", () => {
        expect(checkFirebaseAuthConfig({ source: `setIntlConfig({ locales: ['en'] })` })).toMatchObject({
            valid: true,
            checked: false,
        });
        expect(checkFirebaseAuthConfig({ intlConfigPath: "/nope/intl_config.ts" })).toMatchObject({ checked: false });
    });

    it("reads the config from intlConfigPath and throws with throwOnError", () => {
        const dir = mkdtempSync(join(tmpdir(), "fa-config-check-"));
        try {
            const file = join(dir, "intl_config.ts");
            writeFileSync(file, `setIntlConfig({ firebaseAuth: { apiKey: '' } })`);
            expect(() => checkFirebaseAuthConfig({ intlConfigPath: file, env: {}, throwOnError: true }))
                .toThrow(/INCOMPLETE `firebaseAuth` CONFIG/);
            const report = checkFirebaseAuthConfig({ intlConfigPath: file, env: {} });
            expect(report.valid).toBe(false);
            expect(report.formattedMessage).toContain(file);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

describe("validateFirebaseAuthConfigValues", () => {
    it("returns checked: false and no issues when firebaseAuth is undefined", () => {
        expect(validateFirebaseAuthConfigValues({ firebaseAuth: undefined })).toEqual({
            valid: true, checked: false, issues: [], formattedMessage: "",
        });
    });

    it("reports nothing when every required field resolves to a usable value", () => {
        const report = validateFirebaseAuthConfigValues({
            firebaseAuth: {
                apiKey: "k", authDomain: "d", projectId: "p", appId: "a",
                redirectAuthPath: "/login", homePath: "/",
            },
        });
        expect(report.issues).toEqual([]);
        expect(report.valid).toBe(true);
    });

    it("reports an error per required field that resolved to undefined, null, or an empty string", () => {
        const report = validateFirebaseAuthConfigValues({
            firebaseAuth: {
                apiKey: undefined, authDomain: null, projectId: "  ", appId: "a",
                redirectAuthPath: "/login", homePath: "/",
            },
        });
        expect(report.issues.map((issue) => issue.field)).toEqual([
            "firebaseAuth.apiKey", "firebaseAuth.authDomain", "firebaseAuth.projectId",
        ]);
        expect(report.valid).toBe(false);
    });

    it("does not let a same-named nested appCheck.appId affect the top-level appId check — there's no text to shadow, only real values", () => {
        // The exact bug the static scanner had: appId supplied to the
        // top-level block (e.g. via a spread from another file) and a
        // SEPARATE, differently-sourced appId nested under appCheck. Since
        // this validates real property access, not text search, there's
        // nothing to confuse the two.
        const report = validateFirebaseAuthConfigValues({
            firebaseAuth: {
                apiKey: "k", authDomain: "d", projectId: "p", appId: "top-level-app-id",
                redirectAuthPath: "/login", homePath: "/",
                appCheck: {
                    clientEmail: "a@b.com",
                    appId: undefined,
                    privateKey: "pem",
                },
            },
        });
        expect(report.issues).toEqual([
            { field: "firebaseAuth.appCheck.appId", severity: "warning", reason: "resolved to an empty or missing value" },
        ]);
    });

    it("warns per missing appCheck identity field, and skips appCheck checks entirely when reportMissingServerCredentials is false", () => {
        const withWarnings = validateFirebaseAuthConfigValues({
            firebaseAuth: {
                apiKey: "k", authDomain: "d", projectId: "p", appId: "a",
                redirectAuthPath: "/login", homePath: "/",
                appCheck: { clientEmail: undefined, appId: undefined },
            },
        });
        expect(withWarnings.issues.every((issue) => issue.severity === "warning")).toBe(true);
        expect(withWarnings.valid).toBe(true);

        const optedOut = validateFirebaseAuthConfigValues({
            firebaseAuth: {
                apiKey: "k", authDomain: "d", projectId: "p", appId: "a",
                redirectAuthPath: "/login", homePath: "/",
                appCheck: { clientEmail: undefined, appId: undefined, reportMissingServerCredentials: false },
            },
        });
        expect(optedOut.issues).toEqual([]);
    });

    it("warns (never errors) when appCheck has no usable signing credential, and accepts a complete oauth triple instead of privateKey", () => {
        const noCredential = validateFirebaseAuthConfigValues({
            firebaseAuth: {
                apiKey: "k", authDomain: "d", projectId: "p", appId: "a",
                redirectAuthPath: "/login", homePath: "/",
                appCheck: { clientEmail: "a@b.com", appId: "app-id", privateKey: undefined },
            },
        });
        expect(noCredential.issues).toContainEqual(expect.objectContaining({ field: "firebaseAuth.appCheck.privateKey", severity: "warning" }));
        expect(noCredential.valid).toBe(true);

        const withTriple = validateFirebaseAuthConfigValues({
            firebaseAuth: {
                apiKey: "k", authDomain: "d", projectId: "p", appId: "a",
                redirectAuthPath: "/login", homePath: "/",
                appCheck: {
                    clientEmail: "a@b.com", appId: "app-id", privateKey: undefined,
                    oauthClientId: "id", oauthClientSecret: "secret", oauthRefreshToken: "token",
                },
            },
        });
        expect(withTriple.issues.find((issue) => issue.field.startsWith("firebaseAuth.appCheck.oauth"))).toBeUndefined();
        expect(withTriple.issues.find((issue) => issue.field === "firebaseAuth.appCheck.privateKey")).toBeUndefined();

        const partialTriple = validateFirebaseAuthConfigValues({
            firebaseAuth: {
                apiKey: "k", authDomain: "d", projectId: "p", appId: "a",
                redirectAuthPath: "/login", homePath: "/",
                appCheck: {
                    clientEmail: "a@b.com", appId: "app-id", privateKey: undefined,
                    oauthClientId: "id", oauthClientSecret: "", oauthRefreshToken: undefined,
                },
            },
        });
        expect(partialTriple.issues).toContainEqual(expect.objectContaining({ field: "firebaseAuth.appCheck.oauthClientSecret", severity: "warning" }));
        expect(partialTriple.issues).toContainEqual(expect.objectContaining({ field: "firebaseAuth.appCheck.oauthRefreshToken", severity: "warning" }));

        const nonStringField = validateFirebaseAuthConfigValues({
            firebaseAuth: {
                apiKey: true, authDomain: 123, projectId: {}, appId: "a",
                redirectAuthPath: "/login", homePath: "/",
            } as unknown as Record<string, unknown>,
        });
        expect(nonStringField.issues.find((i) => i.field === "firebaseAuth.apiKey")).toBeUndefined();
    });
});

describe("formatFirebaseAuthConfigMessage", () => {
    it("returns an empty string for no issues and lists the env var to set otherwise", () => {
        expect(formatFirebaseAuthConfigMessage([])).toBe("");
        const message = formatFirebaseAuthConfigMessage([
            { field: "firebaseAuth.apiKey", severity: "error", reason: "not set", envVar: "API_KEY", lineNumber: 7 },
        ]);
        expect(message).toContain("Set API_KEY in your .env");
        expect(message).toContain("Around line 7.");
    });
});
