import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
    test: {
        environment: 'jsdom',
        setupFiles: ['./vitest.setup.ts'],
        benchmark: {
            include: ['src/server/components/helper_script.bench.ts'],
            outputJson: '/private/tmp/claude-501/-Volumes-External-own-projects-cloudflare-next-intl/5816d729-594e-4dc8-b38e-1378f1a159bd/scratchpad/bres.json',
        },
    },
    resolve: {
        alias: {
            '@intl-config': path.resolve(__dirname, './src/test_utils/mock_intl_config.ts'),
            '@locale-file': path.resolve(__dirname, './src/test_utils/mock_locale_file'),
        },
    },
});
