import { describe, it, expect, vi } from 'vitest';

vi.mock('../server/functions/geo.js', () => ({ resolveEnv: vi.fn() }));

import { resolveEnv } from '../server/functions/geo.js';
import { resolveEmailBinding } from './resolve_email_binding.js';

describe('resolveEmailBinding', () => {
    it('returns null when there is no matching binding', async () => {
        vi.mocked(resolveEnv).mockResolvedValue({});
        expect(await resolveEmailBinding({})).toBeNull();
    });

    it('returns the binding when EMAIL.send is a function', async () => {
        const send = vi.fn();
        vi.mocked(resolveEnv).mockResolvedValue({ EMAIL: { send } });
        const binding = await resolveEmailBinding({});
        expect(binding?.send).toBe(send);
    });

    it('reads a custom binding name when given one', async () => {
        const send = vi.fn();
        vi.mocked(resolveEnv).mockResolvedValue({ NOTIFICATIONS_EMAIL: { send } });
        const binding = await resolveEmailBinding({}, 'NOTIFICATIONS_EMAIL');
        expect(binding?.send).toBe(send);
    });
});
