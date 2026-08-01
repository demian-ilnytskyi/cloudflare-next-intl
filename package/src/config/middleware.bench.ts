// @vitest-environment node
import { bench, describe } from 'vitest';
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
