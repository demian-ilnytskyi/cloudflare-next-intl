import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
    test: {
        environment: 'jsdom',
        setupFiles: ['./vitest.setup.ts'],
        benchmark: {
            include: [
                'src/server/components/helper_script.bench.ts',
                'src/image_optimizer/*.bench.ts',
                'src/config/middleware.bench.ts',
                'src/server/functions/get_user_locale.bench.ts',
                'src/firebase_auth/decode_jwt_payload.bench.ts',
                'src/firebase_auth/middleware/update_session.bench.ts',
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
