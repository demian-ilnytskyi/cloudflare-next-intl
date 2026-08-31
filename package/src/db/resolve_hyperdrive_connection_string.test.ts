import { describe, it, expect, vi } from 'vitest';

vi.mock('../server/functions/geo.js', () => ({ resolveEnv: vi.fn() }));

import { resolveEnv } from '../server/functions/geo.js';
import { resolveHyperdriveConnectionString } from './resolve_hyperdrive_connection_string.js';

describe('resolveHyperdriveConnectionString', () => {
    it('returns undefined when there is no HYPERDRIVE binding', async () => {
        vi.mocked(resolveEnv).mockResolvedValue({});
        expect(await resolveHyperdriveConnectionString({})).toBeUndefined();
    });

    it('returns the real connection string when one is bound', async () => {
        vi.mocked(resolveEnv).mockResolvedValue({ HYPERDRIVE: { connectionString: 'postgresql://real:conn@host/db' } });
        expect(await resolveHyperdriveConnectionString({})).toBe('postgresql://real:conn@host/db');
    });

    it("returns undefined for wrangler dev's placeholder connection string", async () => {
        vi.mocked(resolveEnv).mockResolvedValue({ HYPERDRIVE: { connectionString: 'postgresql://user:pass@localhost:5432/db' } });
        expect(await resolveHyperdriveConnectionString({})).toBeUndefined();
    });
});
