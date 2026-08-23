import { describe, expect, it } from 'vitest';
import dbEslintConfig from './eslint_config';

const [flatConfig] = dbEslintConfig;

describe('dbEslintConfig', () => {
    it('restricts the drivers consumers must not reach for', () => {
        const [, options] = flatConfig!.rules!['no-restricted-imports'] as [string, { paths: { name: string; message: string }[] }];
        expect(options.paths.map((path) => path.name)).toEqual(['@supabase/supabase-js', 'pg', 'postgres']);
        for (const path of options.paths) expect(path.message).toContain('withPublicDb');
        expect((options as unknown as { patterns: string[] }).patterns).toEqual(['cloudflare-next-intl/dist/*']);
    });
});
