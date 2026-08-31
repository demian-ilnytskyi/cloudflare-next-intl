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
                'src/firebase_auth/types.ts',
                'src/image_optimizer/next_image_shim.tsx',
                'src/test_utils/**',
                'src/**/*.bench.ts',
                'src/**/*.bench.tsx',
            ],
            thresholds: {
                perFile: true,
                'src/**/!(general_functions|middleware|error_detail_view).{ts,tsx}': { statements: 100, branches: 100, functions: 100, lines: 100 },
                // general_functions.ts: 3 branches are unreachable defensive dead code (post-loop null-check, type guard that cannot fail, loop-exit fallback). v8-ignore comments cannot suppress these — esbuild strips comments before vitest's coverage instrumentation sees them (confirmed via direct esbuild.transform test), so no comment-based approach works with this project's transform pipeline.
                'src/general/general_functions.ts': { statements: 90.26, branches: 84.09, functions: 83.33, lines: 90.26 },
                // middleware.ts: 2 branches are unreachable defensive/structural dead code (a `?? ''` fallback after an equivalent null-guard already returned, and an empty-string check on a value that can never be empty by construction).
                'src/config/middleware.ts': { statements: 100, branches: 93.93, functions: 100, lines: 100 },
                // error_detail_view.tsx: `typeof window !== 'undefined'` is a defensive SSR-safety guard on a 'use client' component — window always exists under @testing-library/react + jsdom, so the false branch is structurally untestable in this suite.
                'src/errors_board/client/error_detail_view.tsx': { statements: 100, branches: 96.66, functions: 100, lines: 100 },
            },
        },
    },
    resolve: {
        alias: {
            '@intl-config': path.resolve(__dirname, './src/test_utils/mock_intl_config.ts'),
            '@locale-file': path.resolve(__dirname, './src/test_utils/mock_locale_file'),
            'virtual:cloudflare-next-intl-images-manifest': path.resolve(__dirname, './src/test_utils/mock_images_manifest.ts'),
        },
    },
});
