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
                'src/**/!(check_firebase_auth_config|load_resolved_firebase_auth|auth_user_provider|device_key|firebase_client|session_sync|device_proof|guarded_refresh|seed_app_check_cookie|update_session|clear_session_action|exchange_turnstile_token_action|restore_session_action|sign_service_account_jwt|sync_session_action).{ts,tsx}': { statements: 100, branches: 100, functions: 100, lines: 100 },
                // check_firebase_auth_config.ts: 3 branches in named import/module specifier resolution and spread resolution are defensive fallbacks.
                'src/firebase_auth_check/check_firebase_auth_config.ts': { statements: 96.26, branches: 90.7, functions: 100, lines: 96.26 },
                // load_resolved_firebase_auth.ts: finally branch on await server?.close() when createServer throws is defensive cleanup.
                'src/firebase_auth_check/load_resolved_firebase_auth.ts': { statements: 100, branches: 95, functions: 100, lines: 100 },
                'src/firebase_auth/client/auth_user_provider.tsx': { statements: 92.95, branches: 92.52, functions: 100, lines: 92.95 },
                'src/firebase_auth/client/device_key.ts': { statements: 88.48, branches: 82.92, functions: 70, lines: 88.48 },
                'src/firebase_auth/client/firebase_client.ts': { statements: 98.45, branches: 96.74, functions: 92.59, lines: 98.45 },
                'src/firebase_auth/client/session_sync.ts': { statements: 87.8, branches: 89.47, functions: 100, lines: 87.8 },
                'src/firebase_auth/device_proof.ts': { statements: 98.01, branches: 90.9, functions: 100, lines: 98.01 },
                'src/firebase_auth/guarded_refresh.ts': { statements: 88.88, branches: 83.33, functions: 100, lines: 88.88 },
                'src/firebase_auth/middleware/seed_app_check_cookie.ts': { statements: 100, branches: 86.66, functions: 100, lines: 100 },
                'src/firebase_auth/middleware/update_session.ts': { statements: 98.59, branches: 97.91, functions: 100, lines: 98.59 },
                'src/firebase_auth/server/clear_session_action.ts': { statements: 93.33, branches: 90.9, functions: 100, lines: 93.33 },
                'src/firebase_auth/server/exchange_turnstile_token_action.ts': { statements: 100, branches: 90.47, functions: 100, lines: 100 },
                'src/firebase_auth/server/restore_session_action.ts': { statements: 88.77, branches: 64.28, functions: 100, lines: 88.77 },
                'src/firebase_auth/server/sign_service_account_jwt.ts': { statements: 100, branches: 92.3, functions: 100, lines: 100 },
                'src/firebase_auth/server/sync_session_action.ts': { statements: 100, branches: 94.44, functions: 100, lines: 100 },
            },
        },
    },
    resolve: {
        alias: {
            '@intl-config': path.resolve(__dirname, './src/test_utils/mock_intl_config.ts'),
        },
    },
});
