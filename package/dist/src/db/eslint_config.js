const MESSAGE = 'Query the database through `withPublicDb`/`withUserDb` from cloudflare-next-intl/db. ' +
    'The package picks the transport (direct Postgres, cfni_exec, or PostgREST) for you.';
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
