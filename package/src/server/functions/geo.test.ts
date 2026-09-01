import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCountry, getTimezone, resolveEnv } from './geo.js';
import type { GenerateRoutingConfig } from '../../types/types.js';

vi.mock('next/headers', () => ({
    headers: vi.fn(),
    cookies: vi.fn(),
}));

describe('geo functions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getCountry', () => {
        it('resolves country from input with Headers object (x-cf-country)', async () => {
            const h = new Headers();
            h.set('x-cf-country', 'UA');
            const result = await getCountry({ headers: h });
            expect(result).toBe('UA');
        });

        it('resolves country from input with Headers object (cf-ipcountry)', async () => {
            const h = new Headers();
            h.set('cf-ipcountry', 'DE');
            const result = await getCountry({ headers: h });
            expect(result).toBe('DE');
        });

        it('resolves country from direct Headers input', async () => {
            const h = new Headers();
            h.set('cf-ipcountry', 'FR');
            const result = await getCountry(h);
            expect(result).toBe('FR');
        });

        it('resolves country from direct Headers input with x-cf-country', async () => {
            const h = new Headers();
            h.set('x-cf-country', 'IT');
            const result = await getCountry(h);
            expect(result).toBe('IT');
        });

        it('falls through when direct Headers has no country', async () => {
            const { headers } = await import('next/headers');
            vi.mocked(headers).mockRejectedValueOnce(new Error('Outside request scope'));
            const h = new Headers();
            const result = await getCountry(h);
            expect(result).toBeUndefined();
        });

        it('resolves country from a cookie on a direct Headers input', async () => {
            const h = new Headers();
            h.set('cookie', '__cf_country__=UA');
            const result = await getCountry(h);
            expect(result).toBe('UA');
        });

        it('resolves country from input with plain record headers', async () => {
            const result = await getCountry({ headers: { 'x-cf-country': 'ES' } });
            expect(result).toBe('ES');
        });

        it('resolves country from input with lowercase record headers fallback', async () => {
            const result = await getCountry({ headers: { 'cf-ipcountry': 'PL' } });
            expect(result).toBe('PL');
        });

        it('resolves country from an explicit cookie header when geo headers are missing', async () => {
            const result = await getCountry({ headers: { cookie: '__cf_country__=UA' } });
            expect(result).toBe('UA');
        });

        it('prefers explicit country headers over the country cookie', async () => {
            const result = await getCountry({
                headers: {
                    'x-cf-country': 'DE',
                    cookie: '__cf_country__=UA',
                },
            });
            expect(result).toBe('DE');
        });

        it('resolves country from explicit request cookies', async () => {
            const result = await getCountry({
                cookies: {
                    get: (name: string) => name === '__cf_country__' ? { value: 'UA' } : undefined,
                },
            });
            expect(result).toBe('UA');
        });

        it('falls through when record headers have empty strings or missing keys', async () => {
            const { headers } = await import('next/headers');
            vi.mocked(headers).mockRejectedValueOnce(new Error('Outside request scope'));
            const result = await getCountry({ headers: { 'x-cf-country': '' }, cf: { country: '' } });
            expect(result).toBeUndefined();
        });

        it('resolves country from input cf object', async () => {
            const result = await getCountry({ cf: { country: 'GB' } });
            expect(result).toBe('GB');
        });

        it('resolves country from next/headers when input not provided', async () => {
            const { headers } = await import('next/headers');
            const mockHeaders = new Headers();
            mockHeaders.set('x-cf-country', 'US');
            vi.mocked(headers).mockResolvedValueOnce(mockHeaders as unknown as Awaited<ReturnType<typeof headers>>);

            const result = await getCountry();
            expect(result).toBe('US');
        });

        it('resolves country from next/headers cf-ipcountry fallback', async () => {
            const { headers } = await import('next/headers');
            const mockHeaders = new Headers();
            mockHeaders.set('cf-ipcountry', 'CA');
            vi.mocked(headers).mockResolvedValueOnce(mockHeaders as unknown as Awaited<ReturnType<typeof headers>>);

            const result = await getCountry();
            expect(result).toBe('CA');
        });

        it('resolves country from next/headers cookie header when geo headers are missing', async () => {
            const { headers } = await import('next/headers');
            const mockHeaders = new Headers();
            mockHeaders.set('cookie', '__cf_country__=UA');
            vi.mocked(headers).mockResolvedValueOnce(mockHeaders as unknown as Awaited<ReturnType<typeof headers>>);

            const result = await getCountry();
            expect(result).toBe('UA');
        });

        it('resolves country from next/headers cookies() when request headers have no country', async () => {
            const { headers, cookies } = await import('next/headers');
            const mockHeaders = new Headers();
            vi.mocked(headers).mockResolvedValueOnce(mockHeaders as unknown as Awaited<ReturnType<typeof headers>>);
            vi.mocked(cookies).mockResolvedValueOnce({
                get: (name: string) => name === '__cf_country__' ? { value: 'UA' } : undefined,
            } as unknown as Awaited<ReturnType<typeof cookies>>);

            const result = await getCountry();
            expect(result).toBe('UA');
        });

        it('resolves country from cookies() when get returns a string', async () => {
            const { headers, cookies } = await import('next/headers');
            const mockHeaders = new Headers();
            vi.mocked(headers).mockResolvedValueOnce(mockHeaders as unknown as Awaited<ReturnType<typeof headers>>);
            vi.mocked(cookies).mockResolvedValueOnce({
                get: (name: string) => name === '__cf_country__' ? 'UA' : undefined,
            } as unknown as Awaited<ReturnType<typeof cookies>>);

            const result = await getCountry();
            expect(result).toBe('UA');
        });

        it('skips an empty country cookie value and malformed cookie parts', async () => {
            const { headers, cookies } = await import('next/headers');
            vi.mocked(headers).mockResolvedValueOnce(new Headers({
                cookie: 'session; __cf_country__=; other=x',
            }) as unknown as Awaited<ReturnType<typeof headers>>);
            vi.mocked(cookies).mockRejectedValueOnce(new Error('Outside request scope'));

            const result = await getCountry();
            expect(result).toBeUndefined();
        });

        it('falls through when the cookie header has no country cookie', async () => {
            const { headers, cookies } = await import('next/headers');
            vi.mocked(headers).mockResolvedValueOnce(new Headers({
                cookie: 'session=abc; theme=dark',
            }) as unknown as Awaited<ReturnType<typeof headers>>);
            vi.mocked(cookies).mockRejectedValueOnce(new Error('Outside request scope'));

            const result = await getCountry();
            expect(result).toBeUndefined();
        });

        it('returns undefined when cookies() throws', async () => {
            const { headers, cookies } = await import('next/headers');
            vi.mocked(headers).mockResolvedValueOnce(new Headers() as unknown as Awaited<ReturnType<typeof headers>>);
            vi.mocked(cookies).mockRejectedValueOnce(new Error('Outside request scope'));

            const result = await getCountry();
            expect(result).toBeUndefined();
        });

        it('reads a mixed-case header name from a lowercase record key', async () => {
            const result = await getCountry(
                { headers: { 'x-country': 'NL' } },
                undefined,
                ['X-Country'],
            );
            expect(result).toBe('NL');
        });

        it('falls through when input.headers is missing and cf.country is not a string', async () => {
            const { headers, cookies } = await import('next/headers');
            vi.mocked(headers).mockRejectedValueOnce(new Error('Outside request scope'));
            vi.mocked(cookies).mockRejectedValueOnce(new Error('Outside request scope'));

            const result = await getCountry({ headers: undefined, cf: { country: 1 as unknown as string } });
            expect(result).toBeUndefined();
        });

        it('falls through when cookies().get has no value and ctx.cf.country is not a string', async () => {
            const { headers, cookies } = await import('next/headers');
            vi.mocked(headers).mockResolvedValueOnce(new Headers() as unknown as Awaited<ReturnType<typeof headers>>);
            vi.mocked(cookies).mockResolvedValueOnce({
                get: () => ({ value: '' }),
            } as unknown as Awaited<ReturnType<typeof cookies>>);

            const result = await getCountry(undefined, {
                ctx: { cf: { country: 1 as unknown as string } },
            } as GenerateRoutingConfig);
            expect(result).toBeUndefined();
        });

        it('falls through when getCloudflareContext returns a non-string country', async () => {
            const { headers, cookies } = await import('next/headers');
            vi.mocked(headers).mockRejectedValueOnce(new Error('Outside request scope'));
            vi.mocked(cookies).mockRejectedValueOnce(new Error('Outside request scope'));

            const result = await getCountry(undefined, {
                getCloudflareContext: vi.fn().mockResolvedValue({ cf: { country: 1 } }),
            } as GenerateRoutingConfig);
            expect(result).toBeUndefined();
        });

        it('falls back to generate.getCloudflareContext when next/headers throws', async () => {
            const { headers } = await import('next/headers');
            vi.mocked(headers).mockRejectedValueOnce(new Error('Outside request scope'));

            const generate = {
                getCloudflareContext: vi.fn().mockResolvedValue({
                    cf: { country: 'JP' },
                }),
            };

            const result = await getCountry(undefined, generate as GenerateRoutingConfig);
            expect(result).toBe('JP');
        });

        it('handles generate.getCloudflareContext resolving empty or null country', async () => {
            const { headers } = await import('next/headers');
            vi.mocked(headers).mockRejectedValueOnce(new Error('Outside request scope'));

            const generate = {
                getCloudflareContext: vi.fn().mockResolvedValue({
                    cf: { country: '' },
                }),
            };

            const result = await getCountry(undefined, generate as GenerateRoutingConfig);
            expect(result).toBeUndefined();
        });

        it('returns undefined when getCloudflareContext throws', async () => {
            const { headers } = await import('next/headers');
            vi.mocked(headers).mockRejectedValueOnce(new Error('Outside request scope'));

            const generate = {
                getCloudflareContext: vi.fn().mockRejectedValue(new Error('Context error')),
            };

            const result = await getCountry(undefined, generate as GenerateRoutingConfig);
            expect(result).toBeUndefined();
        });

        it('resolves country from generate.ctx (sync function)', async () => {
            const { headers } = await import('next/headers');
            vi.mocked(headers).mockRejectedValueOnce(new Error('Outside request scope'));

            const generate = {
                ctx: () => ({ cf: { country: 'UA' } }),
            };

            const result = await getCountry(undefined, generate as GenerateRoutingConfig);
            expect(result).toBe('UA');
        });

        it('resolves country from generate.ctx (async function)', async () => {
            const { headers } = await import('next/headers');
            vi.mocked(headers).mockRejectedValueOnce(new Error('Outside request scope'));

            const generate = {
                ctx: async () => ({ cf: { country: 'UA' } }),
            };

            const result = await getCountry(undefined, generate as GenerateRoutingConfig);
            expect(result).toBe('UA');
        });

        it('resolves country from generate.ctx (static object)', async () => {
            const { headers } = await import('next/headers');
            vi.mocked(headers).mockRejectedValueOnce(new Error('Outside request scope'));

            const generate = {
                ctx: { cf: { country: 'UA' } },
            };

            const result = await getCountry(undefined, generate as GenerateRoutingConfig);
            expect(result).toBe('UA');
        });

        it('handles generate.ctx throwing gracefully', async () => {
            const { headers } = await import('next/headers');
            vi.mocked(headers).mockRejectedValueOnce(new Error('Outside request scope'));

            const generate = {
                ctx: () => { throw new Error('ctx error'); },
            };

            const result = await getCountry(undefined, generate as GenerateRoutingConfig);
            expect(result).toBeUndefined();
        });

        it('falls through when next/headers returns headers without any cf headers', async () => {
            const { headers } = await import('next/headers');
            const mockHeaders = new Headers();
            vi.mocked(headers).mockResolvedValueOnce(mockHeaders as unknown as Awaited<ReturnType<typeof headers>>);

            const result = await getCountry();
            expect(result).toBeUndefined();
        });

        it('returns undefined when no country is found anywhere', async () => {
            const { headers } = await import('next/headers');
            vi.mocked(headers).mockRejectedValueOnce(new Error('Outside request scope'));

            const result = await getCountry();
            expect(result).toBeUndefined();
        });
    });

    describe('getTimezone', () => {
        it('resolves timezone from input with Headers object (x-cf-timezone)', async () => {
            const h = new Headers();
            h.set('x-cf-timezone', 'Europe/Kyiv');
            const result = await getTimezone({ headers: h });
            expect(result).toBe('Europe/Kyiv');
        });

        it('resolves timezone from input with Headers object (cf-timezone)', async () => {
            const h = new Headers();
            h.set('cf-timezone', 'Europe/Berlin');
            const result = await getTimezone({ headers: h });
            expect(result).toBe('Europe/Berlin');
        });

        it('resolves timezone from direct Headers input', async () => {
            const h = new Headers();
            h.set('cf-timezone', 'Europe/Paris');
            const result = await getTimezone(h);
            expect(result).toBe('Europe/Paris');
        });

        it('resolves timezone from direct Headers input with x-cf-timezone', async () => {
            const h = new Headers();
            h.set('x-cf-timezone', 'Europe/Rome');
            const result = await getTimezone(h);
            expect(result).toBe('Europe/Rome');
        });

        it('falls through when direct Headers has no timezone', async () => {
            const { headers } = await import('next/headers');
            vi.mocked(headers).mockRejectedValueOnce(new Error('Outside request scope'));
            const h = new Headers();
            const result = await getTimezone(h, 'UTC');
            expect(result).toBe('UTC');
        });

        it('resolves timezone from a cookie on a direct Headers input', async () => {
            const h = new Headers();
            h.set('cookie', '__cf_timezone__=Europe%2FKyiv');
            const result = await getTimezone(h);
            expect(result).toBe('Europe/Kyiv');
        });

        it('resolves timezone from input with plain record headers', async () => {
            const result = await getTimezone({ headers: { 'x-cf-timezone': 'Europe/Madrid' } });
            expect(result).toBe('Europe/Madrid');
        });

        it('resolves timezone from input with lowercase record headers fallback', async () => {
            const result = await getTimezone({ headers: { 'cf-timezone': 'Europe/Warsaw' } });
            expect(result).toBe('Europe/Warsaw');
        });

        it('resolves timezone from an explicit cookie header when geo headers are missing', async () => {
            const result = await getTimezone({ headers: { cookie: '__cf_timezone__=Europe%2FKyiv' } });
            expect(result).toBe('Europe/Kyiv');
        });

        it('prefers explicit timezone headers over the timezone cookie', async () => {
            const result = await getTimezone({
                headers: {
                    'x-cf-timezone': 'Europe/Berlin',
                    cookie: '__cf_timezone__=Europe%2FKyiv',
                },
            });
            expect(result).toBe('Europe/Berlin');
        });

        it('resolves timezone from explicit request cookies', async () => {
            const result = await getTimezone({
                cookies: {
                    get: (name: string) => name === '__cf_timezone__' ? { value: 'Europe/Kyiv' } : undefined,
                },
            });
            expect(result).toBe('Europe/Kyiv');
        });

        it('falls through when record headers have empty strings or missing keys', async () => {
            const { headers } = await import('next/headers');
            vi.mocked(headers).mockRejectedValueOnce(new Error('Outside request scope'));
            const result = await getTimezone({ headers: { 'x-cf-timezone': '' }, cf: { timezone: '' } }, 'UTC');
            expect(result).toBe('UTC');
        });

        it('resolves timezone from input cf object', async () => {
            const result = await getTimezone({ cf: { timezone: 'Europe/London' } });
            expect(result).toBe('Europe/London');
        });

        it('resolves timezone from next/headers when input not provided', async () => {
            const { headers } = await import('next/headers');
            const mockHeaders = new Headers();
            mockHeaders.set('x-cf-timezone', 'America/New_York');
            vi.mocked(headers).mockResolvedValueOnce(mockHeaders as unknown as Awaited<ReturnType<typeof headers>>);

            const result = await getTimezone();
            expect(result).toBe('America/New_York');
        });

        it('resolves timezone from next/headers cf-timezone fallback', async () => {
            const { headers } = await import('next/headers');
            const mockHeaders = new Headers();
            mockHeaders.set('cf-timezone', 'America/Chicago');
            vi.mocked(headers).mockResolvedValueOnce(mockHeaders as unknown as Awaited<ReturnType<typeof headers>>);

            const result = await getTimezone();
            expect(result).toBe('America/Chicago');
        });

        it('resolves timezone from next/headers cookie header when geo headers are missing', async () => {
            const { headers } = await import('next/headers');
            const mockHeaders = new Headers();
            mockHeaders.set('cookie', '__cf_timezone__=Europe%2FKyiv');
            vi.mocked(headers).mockResolvedValueOnce(mockHeaders as unknown as Awaited<ReturnType<typeof headers>>);

            const result = await getTimezone();
            expect(result).toBe('Europe/Kyiv');
        });

        it('resolves timezone from next/headers cookies() when request headers have no timezone', async () => {
            const { headers, cookies } = await import('next/headers');
            const mockHeaders = new Headers();
            vi.mocked(headers).mockResolvedValueOnce(mockHeaders as unknown as Awaited<ReturnType<typeof headers>>);
            vi.mocked(cookies).mockResolvedValueOnce({
                get: (name: string) => name === '__cf_timezone__' ? { value: 'Europe/Kyiv' } : undefined,
            } as unknown as Awaited<ReturnType<typeof cookies>>);

            const result = await getTimezone();
            expect(result).toBe('Europe/Kyiv');
        });

        it('resolves timezone from cookies() when get returns a string', async () => {
            const { headers, cookies } = await import('next/headers');
            const mockHeaders = new Headers();
            vi.mocked(headers).mockResolvedValueOnce(mockHeaders as unknown as Awaited<ReturnType<typeof headers>>);
            vi.mocked(cookies).mockResolvedValueOnce({
                get: (name: string) => name === '__cf_timezone__' ? 'Europe/Kyiv' : undefined,
            } as unknown as Awaited<ReturnType<typeof cookies>>);

            const result = await getTimezone();
            expect(result).toBe('Europe/Kyiv');
        });

        it('skips an empty timezone cookie value and malformed cookie parts', async () => {
            const { headers, cookies } = await import('next/headers');
            vi.mocked(headers).mockResolvedValueOnce(new Headers({
                cookie: 'session; __cf_timezone__=; other=x',
            }) as unknown as Awaited<ReturnType<typeof headers>>);
            vi.mocked(cookies).mockRejectedValueOnce(new Error('Outside request scope'));

            const result = await getTimezone(undefined, 'UTC');
            expect(result).toBe('UTC');
        });

        it('falls through when the cookie header has no timezone cookie', async () => {
            const { headers, cookies } = await import('next/headers');
            vi.mocked(headers).mockResolvedValueOnce(new Headers({
                cookie: 'session=abc; theme=dark',
            }) as unknown as Awaited<ReturnType<typeof headers>>);
            vi.mocked(cookies).mockRejectedValueOnce(new Error('Outside request scope'));

            const result = await getTimezone(undefined, 'UTC');
            expect(result).toBe('UTC');
        });

        it('returns fallback when cookies() throws', async () => {
            const { headers, cookies } = await import('next/headers');
            vi.mocked(headers).mockResolvedValueOnce(new Headers() as unknown as Awaited<ReturnType<typeof headers>>);
            vi.mocked(cookies).mockRejectedValueOnce(new Error('Outside request scope'));

            const result = await getTimezone(undefined, 'UTC');
            expect(result).toBe('UTC');
        });

        it('reads a mixed-case timezone header name from a lowercase record key', async () => {
            const result = await getTimezone(
                { headers: { 'x-tz': 'Europe/Amsterdam' } },
                undefined,
                undefined,
                ['X-Tz'],
            );
            expect(result).toBe('Europe/Amsterdam');
        });

        it('falls through when input.headers is missing and cf.timezone is not a string', async () => {
            const { headers, cookies } = await import('next/headers');
            vi.mocked(headers).mockRejectedValueOnce(new Error('Outside request scope'));
            vi.mocked(cookies).mockRejectedValueOnce(new Error('Outside request scope'));

            const result = await getTimezone({ headers: undefined, cf: { timezone: 1 as unknown as string } }, 'UTC');
            expect(result).toBe('UTC');
        });

        it('falls through when cookies().get has no value and ctx.cf.timezone is not a string', async () => {
            const { headers, cookies } = await import('next/headers');
            vi.mocked(headers).mockResolvedValueOnce(new Headers() as unknown as Awaited<ReturnType<typeof headers>>);
            vi.mocked(cookies).mockResolvedValueOnce({
                get: () => ({ value: '' }),
            } as unknown as Awaited<ReturnType<typeof cookies>>);

            const result = await getTimezone(undefined, 'UTC', {
                ctx: { cf: { timezone: 1 as unknown as string } },
            } as GenerateRoutingConfig);
            expect(result).toBe('UTC');
        });

        it('falls through when getCloudflareContext returns a non-string timezone', async () => {
            const { headers, cookies } = await import('next/headers');
            vi.mocked(headers).mockRejectedValueOnce(new Error('Outside request scope'));
            vi.mocked(cookies).mockRejectedValueOnce(new Error('Outside request scope'));

            const result = await getTimezone(undefined, 'UTC', {
                getCloudflareContext: vi.fn().mockResolvedValue({ cf: { timezone: 1 } }),
            } as GenerateRoutingConfig);
            expect(result).toBe('UTC');
        });

        it('falls through when next/headers returns headers without any cf headers', async () => {
            const { headers } = await import('next/headers');
            const mockHeaders = new Headers();
            vi.mocked(headers).mockResolvedValueOnce(mockHeaders as unknown as Awaited<ReturnType<typeof headers>>);

            const result = await getTimezone(undefined, 'UTC');
            expect(result).toBe('UTC');
        });

        it('falls back to generate.getCloudflareContext when next/headers throws', async () => {
            const { headers } = await import('next/headers');
            vi.mocked(headers).mockRejectedValueOnce(new Error('Outside request scope'));

            const generate = {
                getCloudflareContext: vi.fn().mockResolvedValue({
                    cf: { timezone: 'Asia/Tokyo' },
                }),
            };

            const result = await getTimezone(undefined, undefined, generate as GenerateRoutingConfig);
            expect(result).toBe('Asia/Tokyo');
        });

        it('handles generate.getCloudflareContext resolving empty or null timezone', async () => {
            const { headers } = await import('next/headers');
            vi.mocked(headers).mockRejectedValueOnce(new Error('Outside request scope'));

            const generate = {
                getCloudflareContext: vi.fn().mockResolvedValue({
                    cf: { timezone: '' },
                }),
            };

            const result = await getTimezone(undefined, 'UTC', generate as GenerateRoutingConfig);
            expect(result).toBe('UTC');
        });

        it('returns fallback parameter when getCloudflareContext throws', async () => {
            const { headers } = await import('next/headers');
            vi.mocked(headers).mockRejectedValueOnce(new Error('Outside request scope'));

            const generate = {
                getCloudflareContext: vi.fn().mockRejectedValue(new Error('Context error')),
            };

            const result = await getTimezone(undefined, 'UTC', generate as GenerateRoutingConfig);
            expect(result).toBe('UTC');
        });

        it('resolves timezone from generate.ctx (sync function)', async () => {
            const { headers } = await import('next/headers');
            vi.mocked(headers).mockRejectedValueOnce(new Error('Outside request scope'));

            const generate = {
                ctx: () => ({ cf: { timezone: 'Europe/Kyiv' } }),
            };

            const result = await getTimezone(undefined, 'UTC', generate as GenerateRoutingConfig);
            expect(result).toBe('Europe/Kyiv');
        });

        it('resolves timezone from generate.ctx (async function)', async () => {
            const { headers } = await import('next/headers');
            vi.mocked(headers).mockRejectedValueOnce(new Error('Outside request scope'));

            const generate = {
                ctx: async () => ({ cf: { timezone: 'Europe/Kyiv' } }),
            };

            const result = await getTimezone(undefined, 'UTC', generate as GenerateRoutingConfig);
            expect(result).toBe('Europe/Kyiv');
        });

        it('resolves timezone from generate.ctx (static object)', async () => {
            const { headers } = await import('next/headers');
            vi.mocked(headers).mockRejectedValueOnce(new Error('Outside request scope'));

            const generate = {
                ctx: { cf: { timezone: 'Europe/Kyiv' } },
            };

            const result = await getTimezone(undefined, 'UTC', generate as GenerateRoutingConfig);
            expect(result).toBe('Europe/Kyiv');
        });

        it('handles generate.ctx throwing in getTimezone', async () => {
            const { headers } = await import('next/headers');
            vi.mocked(headers).mockRejectedValueOnce(new Error('Outside request scope'));

            const generate = {
                ctx: () => { throw new Error('ctx error'); },
            };

            const result = await getTimezone(undefined, 'UTC', generate as GenerateRoutingConfig);
            expect(result).toBe('UTC');
        });

        it('returns fallback when no timezone is found anywhere', async () => {
            const { headers } = await import('next/headers');
            vi.mocked(headers).mockRejectedValueOnce(new Error('Outside request scope'));

            const result = await getTimezone(undefined, 'UTC');
            expect(result).toBe('UTC');
        });
    });

    describe('resolveEnv', () => {
        it('returns undefined when no generate config is present', async () => {
            const result = await resolveEnv();
            expect(result).toBeUndefined();
        });

        it('returns undefined when generate object has neither env nor getCloudflareContext', async () => {
            const result = await resolveEnv({});
            expect(result).toBeUndefined();
        });

        it('returns static env object from generate', async () => {
            const mockEnv = { DB: {} };
            const result = await resolveEnv({ env: mockEnv });
            expect(result).toBe(mockEnv);
        });

        it('resolves functional env from generate (sync)', async () => {
            const mockEnv = { SYNC_ENV: {} };
            const result = await resolveEnv({ env: () => mockEnv });
            expect(result).toBe(mockEnv);
        });

        it('resolves functional env from generate (async)', async () => {
            const mockEnv = { KV: {} };
            const result = await resolveEnv({ env: () => Promise.resolve(mockEnv) });
            expect(result).toBe(mockEnv);
        });

        it('resolves env from getCloudflareContext', async () => {
            const mockEnv = { HYPERDRIVE: {} };
            const result = await resolveEnv({
                getCloudflareContext: vi.fn().mockResolvedValue({ env: mockEnv }),
            });
            expect(result).toBe(mockEnv);
        });

        it('returns undefined when getCloudflareContext throws', async () => {
            const result = await resolveEnv({
                getCloudflareContext: vi.fn().mockRejectedValue(new Error('Context unavailable')),
            });
            expect(result).toBeUndefined();
        });
    });
});

describe('geo header name overrides', () => {
    it('getCountry reads a custom header name passed explicitly', async () => {
        expect(await getCountry(new Headers({ 'x-country': 'UA' }), undefined, ['x-country'])).toBe('UA');
    });

    it('getCountry reads generate.countryHeaderNames when no explicit names are passed', async () => {
        expect(await getCountry(new Headers({ 'x-country': 'UA' }), { countryHeaderNames: ['x-country'] })).toBe('UA');
    });

    it('getTimezone reads a custom header name passed explicitly', async () => {
        expect(await getTimezone(new Headers({ 'x-tz': 'Europe/Kyiv' }), undefined, undefined, ['x-tz'])).toBe('Europe/Kyiv');
    });

    it('getTimezone reads generate.timezoneHeaderNames when no explicit names are passed', async () => {
        expect(await getTimezone(new Headers({ 'x-tz': 'Europe/Kyiv' }), undefined, { timezoneHeaderNames: ['x-tz'] })).toBe('Europe/Kyiv');
    });

    it('falls back to the defaults when no override is configured', async () => {
        expect(await getCountry(new Headers({ 'cf-ipcountry': 'DE' }))).toBe('DE');
        expect(await getTimezone(new Headers({ 'cf-timezone': 'Europe/Berlin' }))).toBe('Europe/Berlin');
    });

    it('reads configuredHeaderNames from intl_config when configured', async () => {
        vi.doMock('../../config/intl_config', () => ({
            default: {
                generate: {
                    countryHeaderNames: ['x-custom-country'],
                    timezoneHeaderNames: ['x-custom-tz'],
                },
            },
        }));
        vi.resetModules();
        const { getCountry: getC, getTimezone: getT } = await import('./geo.js');
        expect(await getC(new Headers({ 'x-custom-country': 'IT' }))).toBe('IT');
        expect(await getT(new Headers({ 'x-custom-tz': 'Europe/Rome' }))).toBe('Europe/Rome');
        vi.doUnmock('../../config/intl_config');
        vi.resetModules();
    });

    it('handles intl_config throwing on import gracefully', async () => {
        vi.doMock('../../config/intl_config', () => {
            throw new Error('module load failed');
        });
        vi.resetModules();
        const { getCountry: getC, getTimezone: getT } = await import('./geo.js');
        expect(await getC(new Headers({ 'cf-ipcountry': 'PL' }))).toBe('PL');
        expect(await getT(new Headers({ 'cf-timezone': 'Europe/Warsaw' }))).toBe('Europe/Warsaw');
        vi.doUnmock('../../config/intl_config');
        vi.resetModules();
    });
});
