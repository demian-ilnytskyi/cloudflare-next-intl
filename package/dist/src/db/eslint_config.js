const MESSAGE = 'Query the database through `withPublicDb`/`withUserDb` from cloudflare-next-intl/db. ' +
    'The package picks the transport (direct Postgres, cfni_exec, or PostgREST) for you.';
/**
 * A flat-config fragment consumers can spread into their `eslint.config.*` to
 * keep application code on the single `db` API.
 *
 * The runtime already refuses to give out a raw client, but an import of
 * `@supabase/supabase-js` or a deep `dist/` path is how that guarantee gets
 * bypassed in practice, so it is worth failing at lint time where the fix is
 * cheap.
 */
const dbEslintConfig = [
    {
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    paths: [
                        { name: '@supabase/supabase-js', message: MESSAGE },
                        { name: 'pg', message: MESSAGE },
                        { name: 'postgres', message: MESSAGE },
                    ],
                    patterns: ['cloudflare-next-intl/dist/*'],
                },
            ],
        },
    },
];
export default dbEslintConfig;
