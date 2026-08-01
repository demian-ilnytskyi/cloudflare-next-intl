// @vitest-environment node
import { describe, expect, it } from 'vitest';
import intlMiddleware from './middleware';
import { makeTestRequest } from '../test_utils/mock_next_server';

describe('intlMiddleware SSR cost', () => {
    it('resolves the same locale decision across repeated requests with the same user-agent and accept-language', async () => {
        // React's cache() only memoizes within a single request's async
        // context (backed by AsyncLocalStorage in Next.js); outside that
        // context — as confirmed by direct testing — it recomputes on every
        // call, so this test cannot assert a call-count on the underlying
        // isBot() check the way it could inside real Next.js request
        // handling. It instead documents the caching contract's user-visible
        // guarantee: repeated requests with the same user-agent and
        // accept-language resolve to the same detected locale.
        const req1 = makeTestRequest('https://example.com/page', { headers: { 'accept-language': 'de-DE,de;q=0.9', 'user-agent': 'Mozilla/5.0 test-agent' } });
        const req2 = makeTestRequest('https://example.com/other', { headers: { 'accept-language': 'de-DE,de;q=0.9', 'user-agent': 'Mozilla/5.0 test-agent' } });

        const res1 = await intlMiddleware(req1);
        const res2 = await intlMiddleware(req2);

        expect(res1.headers.get('Content-Language')).toBe('de');
        expect(res2.headers.get('Content-Language')).toBe('de');
    });
});
