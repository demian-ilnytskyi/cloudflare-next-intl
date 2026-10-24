import { defineConfig } from 'vitest/config';

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
});
