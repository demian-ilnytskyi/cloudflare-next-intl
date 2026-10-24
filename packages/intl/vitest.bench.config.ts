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
        benchmark: {
            include: [
                'src/**/*.bench.ts',
                'src/**/*.bench.tsx',
            ],
            outputJson: process.env.BENCH_JSON ?? './bench-result.json',
        },
    },
    resolve: {
        alias: {
            '@intl-config': path.resolve(__dirname, './src/test_utils/mock_intl_config.ts'),
            '@locale-file': path.resolve(__dirname, './src/test_utils/mock_locale_file'),
        },
    },
});
