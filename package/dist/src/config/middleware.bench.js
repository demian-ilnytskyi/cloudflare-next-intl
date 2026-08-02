// @vitest-environment node
import { bench, describe, vi } from 'vitest';
import intlMiddleware from './middleware';
import { makeTestRequest } from '../test_utils/mock_next_server';
describe('intlMiddleware', () => {
    bench('warm path: valid locale cookie present', async () => {
        const req = makeTestRequest('https://example.com/en/page', { cookies: { __user_locale_key__: 'en' } });
        await intlMiddleware(req);
    });
    bench('cold path: no locale cookie, accept-language parsing', async () => {
        const req = makeTestRequest('https://example.com/page', { headers: { 'accept-language': 'de-DE,de;q=0.9' } });
        await intlMiddleware(req);
    });
});
vi.doMock('./intl_config', () => ({
    default: {
        locales: ['en'],
        defaultLocale: 'en',
        firebaseAuth: { middlewareEnabled: true, redirectAuthPath: '/login', homePath: '/', isAuthPath: () => true },
    },
}));
describe('intlMiddleware with firebaseAuth configured', () => {
    bench('first call: pays the dynamic import of update_session.ts', async () => {
        vi.resetModules();
        const { default: freshIntlMiddleware } = await import('./middleware');
        const req = makeTestRequest('https://example.com/en/page', { cookies: { __user_locale_key__: 'en' } });
        await freshIntlMiddleware(req);
    });
    bench('repeat call: memoized dynamic import (no re-import cost)', async () => {
        const { default: intlMiddlewareWithAuth } = await import('./middleware');
        const req = makeTestRequest('https://example.com/en/page', { cookies: { __user_locale_key__: 'en' } });
        await intlMiddlewareWithAuth(req);
    });
});
