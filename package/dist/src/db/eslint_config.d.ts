/**
 * A flat-config fragment consumers can spread into their `eslint.config.*` to
 * keep application code on the single `db` API.
 *
 * The runtime already refuses to give out a raw client, but an import of
 * `@supabase/supabase-js` or a deep `dist/` path is how that guarantee gets
 * bypassed in practice, so it is worth failing at lint time where the fix is
 * cheap.
 */
declare const dbEslintConfig: {
    rules: {
        'no-restricted-imports': (string | {
            paths: {
                name: string;
                message: string;
            }[];
            patterns: string[];
        })[];
    };
}[];
export default dbEslintConfig;
