// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server.js';
import { makeTestRequest as makeRequest } from '../test_utils/mock_next_server.js';

describe('intlMiddleware with firebaseAuth configured', () => {
    beforeEach(() => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.resetModules();
    });

    it('auto-wires updateFirebaseAuthSession onto the non-redirect response', async () => {
        vi.doMock('./intl_config', () => ({
            default: {
                locales: ['en', 'de'],
                defaultLocale: 'en',
                firebaseAuth: { middlewareEnabled: true, redirectAuthPath: '/login', homePath: '/', isAuthPath: () => false },
            },
        }));
        const updateFirebaseAuthSession = vi.fn(async (_request: unknown, response: NextResponse) => {
            response.headers.set('x-firebase-auth-applied', 'true');
            return response;
        });
        vi.doMock('../firebase_auth/middleware/update_session', () => ({ default: updateFirebaseAuthSession }));

        const { default: intlMiddlewareWithAuth } = await import('./middleware.js');
        const req = makeRequest('https://example.com/en/dashboard');
        const res = await intlMiddlewareWithAuth(req);

        expect(updateFirebaseAuthSession).toHaveBeenCalled();
        expect(res.headers.get('x-firebase-auth-applied')).toBe('true');
    });

    it('skips updateFirebaseAuthSession entirely on a locale-redirect response', async () => {
        vi.doMock('./intl_config', () => ({
            default: {
                locales: ['en', 'de'],
                defaultLocale: 'en',
                firebaseAuth: { middlewareEnabled: true, redirectAuthPath: '/login', homePath: '/', isAuthPath: () => false },
            },
        }));
        const updateFirebaseAuthSession = vi.fn(async (_request: unknown, response: NextResponse) => response);
        vi.doMock('../firebase_auth/middleware/update_session', () => ({ default: updateFirebaseAuthSession }));

        const { default: intlMiddlewareWithAuth } = await import('./middleware.js');
        const req = makeRequest('https://example.com/about', { headers: { 'accept-language': 'de' } });
        await intlMiddlewareWithAuth(req);

        expect(updateFirebaseAuthSession).not.toHaveBeenCalled();
    });

    it('skips updateFirebaseAuthSession when middlewareEnabled is false', async () => {
        vi.doMock('./intl_config', () => ({
            default: {
                locales: ['en', 'de'],
                defaultLocale: 'en',
                firebaseAuth: { middlewareEnabled: false, redirectAuthPath: '/login', homePath: '/', isAuthPath: () => false },
            },
        }));
        const updateFirebaseAuthSession = vi.fn(async (_request: unknown, response: NextResponse) => response);
        vi.doMock('../firebase_auth/middleware/update_session', () => ({ default: updateFirebaseAuthSession }));

        const { default: intlMiddlewareWithAuth } = await import('./middleware.js');
        const req = makeRequest('https://example.com/en/dashboard');
        await intlMiddlewareWithAuth(req);

        expect(updateFirebaseAuthSession).not.toHaveBeenCalled();
    });

    it('passes a rebuildResponse callback that builds NextResponse.next() on the pass-through path', async () => {
        vi.doMock('./intl_config', () => ({
            default: {
                locales: ['en', 'de'],
                defaultLocale: 'en',
                firebaseAuth: { middlewareEnabled: true, redirectAuthPath: '/login', homePath: '/', isAuthPath: () => false },
            },
        }));
        let capturedRebuild: ((request: unknown) => NextResponse) | undefined;
        const updateFirebaseAuthSession = vi.fn(async (_request: unknown, response: NextResponse, _locale: string, rebuildResponse: (request: unknown) => NextResponse) => {
            capturedRebuild = rebuildResponse;
            return response;
        });
        vi.doMock('../firebase_auth/middleware/update_session', () => ({ default: updateFirebaseAuthSession }));

        const { default: intlMiddlewareWithAuth } = await import('./middleware.js');
        const req = makeRequest('https://example.com/en/dashboard');
        await intlMiddlewareWithAuth(req);

        expect(capturedRebuild).toBeDefined();
        const rebuilt = capturedRebuild!(req);
        expect(rebuilt.status).toBe(200);
        expect(rebuilt.headers.get('x-middleware-next')).toBe('1');
    });

    it('passes a rebuildResponse callback that builds NextResponse.rewrite() when a rewrite is in effect', async () => {
        vi.doMock('./intl_config', () => ({
            default: {
                locales: ['en', 'de'],
                defaultLocale: 'en',
                firebaseAuth: { middlewareEnabled: true, redirectAuthPath: '/login', homePath: '/', isAuthPath: () => false },
            },
        }));
        let capturedRebuild: ((request: unknown) => NextResponse) | undefined;
        const updateFirebaseAuthSession = vi.fn(async (_request: unknown, response: NextResponse, _locale: string, rebuildResponse: (request: unknown) => NextResponse) => {
            capturedRebuild = rebuildResponse;
            return response;
        });
        vi.doMock('../firebase_auth/middleware/update_session', () => ({ default: updateFirebaseAuthSession }));

        const { default: intlMiddlewareWithAuth } = await import('./middleware.js');
        // Default-locale URL with no locale prefix takes the rewrite (not
        // redirect) path, so `rewriteUrl` is set when `rebuildResponse` runs.
        const req = makeRequest('https://example.com/dashboard');
        await intlMiddlewareWithAuth(req);

        expect(capturedRebuild).toBeDefined();
        const rebuilt = capturedRebuild!(req);
        expect(rebuilt.status).toBe(200);
        expect(rebuilt.headers.get('x-middleware-rewrite')).toContain('/en/dashboard');
    });

    it('does not import update_session without firebaseAuth', async () => {
        vi.doMock('./intl_config', () => ({
            default: {
                locales: ['en', 'de'],
                defaultLocale: 'en',
            },
        }));
        const factory = vi.fn(() => ({ default: vi.fn() }));
        vi.doMock('../firebase_auth/middleware/update_session.js', factory);

        const { default: intlMiddleware } = await import('./middleware.js');
        const req = makeRequest('https://example.com/en/dashboard');
        await intlMiddleware(req);

        expect(factory).not.toHaveBeenCalled();
    });
});
