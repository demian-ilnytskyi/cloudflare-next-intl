import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import * as React from 'react';

vi.mock('next/dynamic', () => ({
    default: (loader: () => Promise<{ default: React.ComponentType<Record<string, unknown>> }>) => {
        return function DynamicWrapper(props: Record<string, unknown>) {
            const [Comp, setComp] = React.useState<React.ComponentType<Record<string, unknown>> | null>(null);
            React.useEffect(() => {
                loader().then((m) => setComp(() => m.default));
            }, []);
            if (!Comp) return null;
            const C = Comp;
            return <C {...props} />;
        };
    },
}));
vi.mock('../functions/server', () => ({ getMessage: vi.fn(async () => ({ Common: { title: 'Hello' } })) }));

let firebaseAuthValue: Record<string, unknown> | undefined;
let cookieConsentValue: Record<string, unknown> | undefined;
vi.mock('@intl-config', () => ({
    get default() {
        return { locales: ['en', 'de'], defaultLocale: 'en', firebaseAuth: firebaseAuthValue, cookieConsent: cookieConsentValue };
    },
}));

vi.mock('../../firebase_auth/server/auth_user_server_provider', () => ({
    resolveAuthUserAndRedirect: vi.fn(async () => ({ uid: 'server-user', email: null, emailVerified: true, displayName: null })),
}));

vi.mock('../../firebase_auth/client/auth_user_provider', () => ({
    default: ({ children }: { children: React.ReactNode }) => <div data-testid="auth-provider">{children}</div>,
}));

vi.mock('../../cookie_consent/client/cookie_consent_provider', () => ({
    default: ({ children, requiresConsent }: { children: React.ReactNode; requiresConsent?: boolean }) => (
        <div data-testid="cookie-consent-provider" data-requires-consent={String(requiresConsent)}>{children}</div>
    ),
}));

vi.mock('../../cookie_consent/client/components/cookie_consent_analytics', () => ({
    default: ({ secrets }: { secrets: Record<string, unknown> }) => (
        <div data-testid="cookie-consent-analytics">{JSON.stringify(secrets)}</div>
    ),
}));

describe('LocationzationProvider', () => {
    beforeEach(() => {
        firebaseAuthValue = undefined;
        cookieConsentValue = undefined;
    });


    it('renders children through the client provider when messages are provided', async () => {
        const { default: LocationzationProvider } = await import('./server_provider');
        render(await LocationzationProvider({ language: 'en', messages: { Common: {} }, children: <span>child</span> }));
        expect(await screen.findByText('child')).toBeInTheDocument();
    });

    it('loads messages via getMessage when none are provided', async () => {
        const { getMessage } = await import('../functions/server');
        const { default: LocationzationProvider } = await import('./server_provider');
        render(await LocationzationProvider({ language: 'en', children: <span>child</span> }));
        expect(getMessage).toHaveBeenCalledWith('en');
    });

    it('calls notFound() for an unconfigured locale', async () => {
        const { default: LocationzationProvider } = await import('./server_provider');
        await expect(
            LocationzationProvider({ language: 'zz', children: <span>child</span> }),
        ).rejects.toThrow();
    });

    it('resolves the auth user and passes it to the client provider when firebaseAuth is configured', async () => {
        firebaseAuthValue = {};
        vi.resetModules();
        const { resolveAuthUserAndRedirect } = await import('../../firebase_auth/server/auth_user_server_provider');
        const { default: LocationzationProvider } = await import('./server_provider');
        render(await LocationzationProvider({ language: 'en', messages: { Common: {} }, children: <span>child</span> }));
        expect(resolveAuthUserAndRedirect).toHaveBeenCalled();
        const authProvider = await screen.findByTestId('auth-provider');
        expect(authProvider).toBeInTheDocument();
        expect(authProvider).toHaveTextContent('child');
    });

    it('does not call resolveAuthUserAndRedirect or render the auth provider when autoWireClientProvider is false', async () => {
        firebaseAuthValue = { autoWireClientProvider: false };
        vi.resetModules();
        vi.clearAllMocks();
        const { resolveAuthUserAndRedirect } = await import('../../firebase_auth/server/auth_user_server_provider');
        const { default: LocationzationProvider } = await import('./server_provider');
        render(await LocationzationProvider({ language: 'en', messages: { Common: {} }, children: <span>child</span> }));
        expect(resolveAuthUserAndRedirect).not.toHaveBeenCalled();
        expect(screen.queryByTestId('auth-provider')).not.toBeInTheDocument();
        expect(await screen.findByText('child')).toBeInTheDocument();
    });

    it('wraps children in CookieConsentProvider and passes resolved static secrets when cookieConsent.secrets is configured', async () => {
        cookieConsentValue = { secrets: { googleAnalyticsId: 'G-XXX' } };
        vi.resetModules();
        const { default: LocationzationProvider } = await import('./server_provider');
        render(await LocationzationProvider({ language: 'en', messages: { Common: {} }, children: <span>child</span> }));
        const provider = await screen.findByTestId('cookie-consent-provider');
        expect(provider).toHaveTextContent('child');
        expect(await screen.findByTestId('cookie-consent-analytics')).toHaveTextContent('G-XXX');
    });

    it('resolves secrets via getSecrets, taking precedence over static secrets', async () => {
        const getSecrets = vi.fn(async () => ({ googleAdsId: 'AW-YYY' }));
        cookieConsentValue = { secrets: { googleAnalyticsId: 'G-XXX' }, getSecrets };
        vi.resetModules();
        const { default: LocationzationProvider } = await import('./server_provider');
        render(await LocationzationProvider({ language: 'en', messages: { Common: {} }, children: <span>child</span> }));
        expect(getSecrets).toHaveBeenCalled();
        expect(await screen.findByTestId('cookie-consent-analytics')).toHaveTextContent('AW-YYY');
    });

    it('does not resolve or render analytics when autoWireAnalytics is false', async () => {
        const getSecrets = vi.fn(async () => ({ googleAnalyticsId: 'G-XXX' }));
        cookieConsentValue = { getSecrets, autoWireAnalytics: false };
        vi.resetModules();
        const { default: LocationzationProvider } = await import('./server_provider');
        render(await LocationzationProvider({ language: 'en', messages: { Common: {} }, children: <span>child</span> }));
        expect(getSecrets).not.toHaveBeenCalled();
        await screen.findByTestId('cookie-consent-provider');
        expect(screen.queryByTestId('cookie-consent-analytics')).not.toBeInTheDocument();
    });

    it('renders CookieConsentProvider without analytics when cookieConsent has no secrets configured', async () => {
        cookieConsentValue = {};
        vi.resetModules();
        const { default: LocationzationProvider } = await import('./server_provider');
        render(await LocationzationProvider({ language: 'en', messages: { Common: {} }, children: <span>child</span> }));
        await screen.findByTestId('cookie-consent-provider');
        expect(screen.queryByTestId('cookie-consent-analytics')).not.toBeInTheDocument();
    });

    it('resolves requiresConsent via getCloudflareContext and passes it to the client provider', async () => {
        cookieConsentValue = { getCloudflareContext: () => ({ cf: { country: 'DE' } }) };
        vi.resetModules();
        const { default: LocationzationProvider } = await import('./server_provider');
        render(await LocationzationProvider({ language: 'en', messages: { Common: {} }, children: <span>child</span> }));
        expect(await screen.findByTestId('cookie-consent-provider')).toHaveAttribute('data-requires-consent', 'true');
    });

    it('resolves requiresConsent via getCountryCode, taking precedence over getCloudflareContext', async () => {
        cookieConsentValue = {
            getCountryCode: () => 'US',
            getCloudflareContext: () => ({ cf: { country: 'DE' } }),
        };
        vi.resetModules();
        const { default: LocationzationProvider } = await import('./server_provider');
        render(await LocationzationProvider({ language: 'en', messages: { Common: {} }, children: <span>child</span> }));
        expect(await screen.findByTestId('cookie-consent-provider')).toHaveAttribute('data-requires-consent', 'false');
    });

    it('defaults requiresConsent to true when neither getCountryCode nor getCloudflareContext is set', async () => {
        cookieConsentValue = {};
        vi.resetModules();
        const { default: LocationzationProvider } = await import('./server_provider');
        render(await LocationzationProvider({ language: 'en', messages: { Common: {} }, children: <span>child</span> }));
        expect(await screen.findByTestId('cookie-consent-provider')).toHaveAttribute('data-requires-consent', 'true');
    });

    it('defaults requiresConsent to true when cookieConsent is not configured at all', async () => {
        vi.resetModules();
        const { default: LocationzationProvider } = await import('./server_provider');
        render(await LocationzationProvider({ language: 'en', messages: { Common: {} }, children: <span>child</span> }));
        expect(screen.queryByTestId('cookie-consent-provider')).not.toBeInTheDocument();
        expect(await screen.findByText('child')).toBeInTheDocument();
    });

    it('does not resolve analytics secrets when NODE_ENV is development and enableAnalyticsInDevMode is unset', async () => {
        const originalEnv = process.env.NODE_ENV;
        vi.stubEnv('NODE_ENV', 'development');
        const getSecrets = vi.fn(async () => ({ googleAnalyticsId: 'G-XXX' }));
        cookieConsentValue = { getSecrets };
        vi.resetModules();
        const { default: LocationzationProvider } = await import('./server_provider');
        render(await LocationzationProvider({ language: 'en', messages: { Common: {} }, children: <span>child</span> }));
        expect(getSecrets).not.toHaveBeenCalled();
        expect(screen.queryByTestId('cookie-consent-analytics')).not.toBeInTheDocument();
        vi.stubEnv('NODE_ENV', originalEnv ?? 'test');
    });

    it('resolves analytics secrets when NODE_ENV is development and enableAnalyticsInDevMode is true', async () => {
        const originalEnv = process.env.NODE_ENV;
        vi.stubEnv('NODE_ENV', 'development');
        const getSecrets = vi.fn(async () => ({ googleAnalyticsId: 'G-XXX' }));
        cookieConsentValue = { getSecrets, enableAnalyticsInDevMode: true };
        vi.resetModules();
        const { default: LocationzationProvider } = await import('./server_provider');
        render(await LocationzationProvider({ language: 'en', messages: { Common: {} }, children: <span>child</span> }));
        expect(getSecrets).toHaveBeenCalled();
        expect(await screen.findByTestId('cookie-consent-analytics')).toHaveTextContent('G-XXX');
        vi.stubEnv('NODE_ENV', originalEnv ?? 'test');
    });
});
