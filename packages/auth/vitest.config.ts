import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
    test: {
        environment: 'jsdom',
        testTimeout: 10000,
        setupFiles: ['./vitest.setup.ts'],
        server: {
            deps: {
                inline: ['react', 'cloudflare-next-intl-intl'],
            },
        },
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov'],
            include: ['src/**'],
            exclude: [
                'src/**/index.ts',
                'src/**/*.d.ts',
                'src/**/*.test-d.ts',
                'src/types.ts',
                'src/firebase_auth/types.ts',
                'src/test_utils/**',
                'src/**/*.bench.ts',
                'src/**/*.bench.tsx',
            ],
            thresholds: {
                perFile: true,
                'src/**/!(check_firebase_auth_config|load_resolved_firebase_auth|auto_firebase_performance_events|auth_user_provider|device_key|firebase_client|session_sync|device_proof|guarded_refresh|seed_app_check_cookie|update_session|clear_session_action|exchange_turnstile_token_action|restore_session_action|sign_service_account_jwt|sync_session_action).{ts,tsx}': { statements: 100, branches: 100, functions: 100, lines: 100 },
                // check_firebase_auth_config.ts: 3 branches in named import/module specifier resolution and spread resolution are defensive fallbacks (unresolvable module path fallback, missing import specifier, and catch-block during file read error).
                'src/firebase_auth_check/check_firebase_auth_config.ts': { statements: 96.26, branches: 90.7, functions: 100, lines: 96.26 },
                // load_resolved_firebase_auth.ts: finally branch on await server?.close() when createServer throws is defensive cleanup.
                'src/firebase_auth_check/load_resolved_firebase_auth.ts': { statements: 100, branches: 95, functions: 100, lines: 100 },
            },
        },
    },
    resolve: {
        alias: {
            '@intl-config': path.resolve(__dirname, './src/test_utils/mock_intl_config.ts'),
        },
    },
});
