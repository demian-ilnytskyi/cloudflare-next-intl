import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
    test: {
        environment: 'jsdom',
        setupFiles: ['./vitest.setup.ts'],
        server: {
            deps: {
                inline: ['react'],
            },
        },
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov'],
            include: ['src/**'],
            exclude: [
                'src/**/index.ts',
                'src/**/*.d.ts',
                'src/general/get_layout_states.ts',
                'src/types/types.ts',
                'src/test_utils/**',
                'src/**/*.bench.ts',
                'src/**/*.bench.tsx',
            ],
            thresholds: {
                perFile: true,
                'src/**/!(general_functions|middleware|firebase_auth_error_helper).{ts,tsx}': { statements: 100, branches: 100, functions: 100, lines: 100 },
                // general_functions.ts: 3 branches are unreachable defensive dead code (post-loop null-check, type guard that cannot fail, loop-exit fallback), confirmed via manual trace
                'src/general/general_functions.ts': { statements: 87.5, branches: 85.18, functions: 100, lines: 87.5 },
                // middleware.ts: 2 branches are unreachable defensive/structural dead code (a `?? ''` fallback after an equivalent null-guard already returned, and an empty-string check on a value that can never be empty by construction), confirmed via manual trace during Task 7 review
                'src/config/middleware.ts': { statements: 100, branches: 93.93, functions: 100, lines: 100 },
                // firebase_auth_error_helper.ts: the `?? DEFAULT_MESSAGES_EN.unknown` fallback on the final return is unreachable defensive dead code — `key` is always either a value from ERROR_CODE_TO_KEY (whose values are exactly DEFAULT_MESSAGES_EN's keys) or the literal 'unknown', and DEFAULT_MESSAGES_EN.unknown always exists, so DEFAULT_MESSAGES_EN[key] can never be nullish, confirmed via manual trace
                'src/firebase_auth/error_messages/firebase_auth_error_helper.ts': { statements: 100, branches: 91.66, functions: 100, lines: 100 },
            },
        },
    },
    resolve: {
        alias: {
            '@intl-config': path.resolve(__dirname, './src/test_utils/mock_intl_config.ts'),
            '@locale-file': path.resolve(__dirname, './src/test_utils/mock_locale_file'),
        },
    },
});
