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
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov'],
            include: ['src/**'],
            exclude: [
                'src/**/index.ts',
                'src/**/*.d.ts',
                'src/**/*.bench.ts',
                'src/**/*.bench.tsx',
            ],
            thresholds: {
                perFile: true,
                'src/**/*.{ts,tsx}': { statements: 100, branches: 100, functions: 100, lines: 100 },
            },
        },
    },
});
