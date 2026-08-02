import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useContext, useEffect, useState } from 'react';
import { LocaleContext } from './client_provider';

vi.mock('../../general/cache_variables', () => ({
    setLocaleCache: vi.fn(),
    setMessageForLocaleCache: vi.fn(),
}));

let currentConfig: { firebaseAuth?: Record<string, unknown>; cookieConsent?: Record<string, unknown> };
vi.mock('@intl-config', () => ({
    get default() {
        return currentConfig;
    },
}));

vi.mock('next/dynamic', () => ({
    default: (loader: () => Promise<{ default: React.ComponentType<Record<string, unknown>> }>) => {
        return function DynamicWrapper(props: Record<string, unknown>) {
            const [Comp, setComp] = useState<React.ComponentType<Record<string, unknown>> | null>(null);
            useEffect(() => {
                loader().then((m) => setComp(() => m.default));
            }, []);
            if (!Comp) return null;
            const C = Comp;
            return <C {...props} />;
        };
    },
}));

let authProviderMountCount = 0;
vi.mock('../../firebase_auth/client/auth_user_provider', () => ({
    default: ({ children }: { children: React.ReactNode }) => {
        useEffect(() => {
            authProviderMountCount += 1;
        }, []);
        return <div data-testid="auth-provider">{children}</div>;
    },
}));

vi.mock('../../cookie_consent/client/cookie_consent_provider', () => ({
    default: ({ children, requiresConsent }: { children: React.ReactNode; requiresConsent?: boolean }) => (
        <div data-testid="cookie-consent-provider" data-requires-consent={String(requiresConsent)}>{children}</div>
    ),
}));

vi.mock('../../cookie_consent/client/components/cookie_consent_analytics', () => ({
    default: () => <div data-testid="cookie-consent-analytics" />,
}));

vi.mock('../../cookie_consent/client/components/cookie_consent_dialog', () => ({
    default: (props: Record<string, unknown>) => <div data-testid="cookie-consent-dialog" data-props={JSON.stringify(props)} />,
}));

vi.mock('../../cookie_consent/client/components/privacy_policy_update_dialog', () => ({
    default: (props: Record<string, unknown>) => <div data-testid="privacy-policy-update-dialog" data-props={JSON.stringify(props)} />,
}));

function Consumer() {
    const ctx = useContext(LocaleContext);
    return <span>{ctx?.language}</span>;
}

describe('LocationzationClientProvider', () => {
    beforeEach(() => {
        currentConfig = {};
        authProviderMountCount = 0;
    });

    it('provides language/messages via context to children', async () => {
        const { setLocaleCache, setMessageForLocaleCache } = await import('../../general/cache_variables');
        const { default: LocationzationClientProvider } = await import('./client_provider');
        render(
            <LocationzationClientProvider language="en" messages={{ Common: {} }}>
                <Consumer />
            </LocationzationClientProvider>,
        );
        expect(screen.getByText('en')).toBeInTheDocument();
        expect(setLocaleCache).toHaveBeenCalledWith('en');
        expect(setMessageForLocaleCache).toHaveBeenCalledWith('en', { Common: {} });
    });

    it('wraps children in the client AuthUserProvider when firebaseAuth is configured', async () => {
        currentConfig = { firebaseAuth: {} };
        const { default: LocationzationClientProvider } = await import('./client_provider');
        render(
            <LocationzationClientProvider language="en" messages={{ Common: {} }} initialAuthUser={null}>
                <span>child</span>
            </LocationzationClientProvider>,
        );
        expect(await screen.findByTestId('auth-provider')).toBeInTheDocument();
        expect(await screen.findByText('child')).toBeInTheDocument();
    });

    // Regression: `dynamic()` was previously called inside the component
    // body, creating a brand-new component identity every render — React
    // then unmounts/remounts AuthUserProvider on every single render of
    // LocationzationClientProvider instead of reusing the existing
    // instance. A remount re-subscribes AuthUserProvider's
    // onIdTokenChanged listener, which Firebase immediately replays with
    // the current user, triggering a state update (and a forced token
    // refresh) that causes another render — an infinite loop of
    // session-cookie writes, one per render. `dynamic()` must be called at
    // module scope so the same component reference survives re-renders.
    it('does not remount AuthUserProvider when LocationzationClientProvider re-renders (regression)', async () => {
        currentConfig = { firebaseAuth: {} };
        const { default: LocationzationClientProvider } = await import('./client_provider');
        const { rerender } = render(
            <LocationzationClientProvider language="en" messages={{ Common: {} }} initialAuthUser={null}>
                <span>child</span>
            </LocationzationClientProvider>,
        );
        await screen.findByTestId('auth-provider');
        await vi.waitFor(() => expect(authProviderMountCount).toBe(1));

        await act(async () => {
            rerender(
                <LocationzationClientProvider language="en" messages={{ Common: {} }} initialAuthUser={null}>
                    <span>child (re-rendered)</span>
                </LocationzationClientProvider>,
            );
        });
        expect(authProviderMountCount).toBe(1);
    });

    it('does not wrap children in AuthUserProvider when skipAuthProvider is true, even with firebaseAuth configured', async () => {
        currentConfig = { firebaseAuth: {} };
        const { default: LocationzationClientProvider } = await import('./client_provider');
        render(
            <LocationzationClientProvider language="en" messages={{ Common: {} }} initialAuthUser={null} skipAuthProvider>
                <span>child</span>
            </LocationzationClientProvider>,
        );
        expect(screen.queryByTestId('auth-provider')).not.toBeInTheDocument();
        expect(await screen.findByText('child')).toBeInTheDocument();
    });

    it('wraps children in CookieConsentProvider when cookieConsent is configured, without analytics when no analytics resolve', async () => {
        currentConfig = { cookieConsent: {} };
        const { default: LocationzationClientProvider } = await import('./client_provider');
        render(
            <LocationzationClientProvider language="en" messages={{ Common: {} }}>
                <span>child</span>
            </LocationzationClientProvider>,
        );
        const provider = await screen.findByTestId('cookie-consent-provider');
        expect(provider).toHaveTextContent('child');
        expect(screen.queryByTestId('cookie-consent-analytics')).not.toBeInTheDocument();
    });

    it('renders CookieConsentAnalytics when analyticsSecrets resolve', async () => {
        currentConfig = { cookieConsent: {} };
        const { default: LocationzationClientProvider } = await import('./client_provider');
        render(
            <LocationzationClientProvider language="en" messages={{ Common: {} }} analyticsSecrets={{ googleAnalyticsId: 'G-XXX' }}>
                <span>child</span>
            </LocationzationClientProvider>,
        );
        expect(await screen.findByTestId('cookie-consent-analytics')).toBeInTheDocument();
    });

    it('nests AuthUserProvider inside CookieConsentProvider when both are configured', async () => {
        currentConfig = { firebaseAuth: {}, cookieConsent: {} };
        const { default: LocationzationClientProvider } = await import('./client_provider');
        render(
            <LocationzationClientProvider language="en" messages={{ Common: {} }}>
                <span>child</span>
            </LocationzationClientProvider>,
        );
        const cookieProvider = await screen.findByTestId('cookie-consent-provider');
        const authProvider = await screen.findByTestId('auth-provider');
        expect(cookieProvider).toContainElement(authProvider);
        expect(authProvider).toHaveTextContent('child');
    });

    it('passes requiresConsent through to CookieConsentProvider, defaulting to true', async () => {
        currentConfig = { cookieConsent: {} };
        const { default: LocationzationClientProvider } = await import('./client_provider');
        render(
            <LocationzationClientProvider language="en" messages={{ Common: {} }}>
                <span>child</span>
            </LocationzationClientProvider>,
        );
        expect(await screen.findByTestId('cookie-consent-provider')).toHaveAttribute('data-requires-consent', 'true');
    });

    it('passes requiresConsent=false through to CookieConsentProvider', async () => {
        currentConfig = { cookieConsent: {} };
        const { default: LocationzationClientProvider } = await import('./client_provider');
        render(
            <LocationzationClientProvider language="en" messages={{ Common: {} }} requiresConsent={false}>
                <span>child</span>
            </LocationzationClientProvider>,
        );
        expect(await screen.findByTestId('cookie-consent-provider')).toHaveAttribute('data-requires-consent', 'false');
    });

    it('auto-wires CookieConsentDialog and PrivacyPolicyUpdateDialog by default when cookieConsent is configured', async () => {
        currentConfig = { cookieConsent: {} };
        const { default: LocationzationClientProvider } = await import('./client_provider');
        render(
            <LocationzationClientProvider language="en" messages={{ Common: {} }}>
                <span>child</span>
            </LocationzationClientProvider>,
        );
        expect(await screen.findByTestId('cookie-consent-dialog')).toBeInTheDocument();
        expect(await screen.findByTestId('privacy-policy-update-dialog')).toBeInTheDocument();
    });

    it('does not render the auto-wired dialogs when autoWireDialogs is false', async () => {
        currentConfig = { cookieConsent: {} };
        const { default: LocationzationClientProvider } = await import('./client_provider');
        render(
            <LocationzationClientProvider language="en" messages={{ Common: {} }} autoWireDialogs={false}>
                <span>child</span>
            </LocationzationClientProvider>,
        );
        await screen.findByTestId('cookie-consent-provider');
        expect(screen.queryByTestId('cookie-consent-dialog')).not.toBeInTheDocument();
        expect(screen.queryByTestId('privacy-policy-update-dialog')).not.toBeInTheDocument();
    });

    it('forwards dialogProps/updateDialogProps to the auto-wired dialogs', async () => {
        currentConfig = { cookieConsent: {} };
        const { default: LocationzationClientProvider } = await import('./client_provider');
        render(
            <LocationzationClientProvider
                language="en"
                messages={{ Common: {} }}
                dialogProps={{ acceptText: 'Yes' }}
                updateDialogProps={{ closeText: 'Close' }}>
                <span>child</span>
            </LocationzationClientProvider>,
        );
        expect(await screen.findByTestId('cookie-consent-dialog')).toHaveAttribute('data-props', JSON.stringify({ acceptText: 'Yes' }));
        expect(await screen.findByTestId('privacy-policy-update-dialog')).toHaveAttribute('data-props', JSON.stringify({ closeText: 'Close' }));
    });

    it('does not render the auto-wired dialogs when cookieConsent is unconfigured', async () => {
        currentConfig = {};
        const { default: LocationzationClientProvider } = await import('./client_provider');
        render(
            <LocationzationClientProvider language="en" messages={{ Common: {} }}>
                <span>child</span>
            </LocationzationClientProvider>,
        );
        expect(screen.queryByTestId('cookie-consent-dialog')).not.toBeInTheDocument();
        expect(screen.queryByTestId('privacy-policy-update-dialog')).not.toBeInTheDocument();
    });
});
