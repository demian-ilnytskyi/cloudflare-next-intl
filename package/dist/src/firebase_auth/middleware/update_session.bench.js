// @vitest-environment node
import { bench, describe, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { makeTestRequest } from '../../test_utils/mock_next_server';
const baseFa = {
    apiKey: 'bench-api-key',
    authDomain: 'domain',
    projectId: 'proj',
    appId: 'app',
    redirectAuthPath: '/login',
    homePath: '/',
    isAuthPath: (path) => path === '/login',
};
vi.mock('@intl-config', () => ({
    default: { locales: ['en'], defaultLocale: 'en', firebaseAuth: baseFa },
}));
function makeJwt(exp) {
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url');
    return `${header}.${payload}.sig`;
}
describe('updateSession', () => {
    bench('valid, unexpired session cookie: isJwtExpired parse + pass-through', async () => {
        const { default: updateSession } = await import('./update_session');
        const req = makeTestRequest('https://example.com/en/dashboard', {
            cookies: { __fa_session__: makeJwt(Date.now() / 1000 + 3600) },
        });
        await updateSession(req, NextResponse.next(), 'en');
    });
    bench('malformed session cookie: isJwtExpired parse failure path', async () => {
        const { default: updateSession } = await import('./update_session');
        const req = makeTestRequest('https://example.com/en/dashboard', {
            cookies: { __fa_session__: 'not.valid.jwt' },
        });
        await updateSession(req, NextResponse.next(), 'en');
    });
});
