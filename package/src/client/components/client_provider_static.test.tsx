import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useContext, useEffect, useState } from 'react';
import { LocaleContext } from './client_provider_static';

vi.mock('../../general/cache_variables', () => ({
    setLocaleCache: vi.fn(),
    setMessageForLocaleCache: vi.fn(),
}));

let currentConfig: { cookieConsent?: Record<string, unknown> };
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
                let mounted = true;
                loader().then((m) => {
                    if (mounted) setComp(() => m.default);
                });
                return () => {
                    mounted = false;
                };
            }, []);
            if (!Comp) return null;
            const C = Comp;
            return <C {...props} />;
        };
    },
}));

vi.mock('../../cookie_consent/client/cookie_consent_provider', async () => {
    const React = await import('react');
    return {
        CookieConsentContext: React.createContext({
            consent: null,
            requiresConsent: true,
            setConsent: () => {},
            privacyPolicyUpdated: false,
            acknowledgePrivacyPolicyUpdate: () => {},
        }),
        default: ({ children, requiresConsent }: { children: React.ReactNode; requiresConsent?: boolean }) => (
            <div data-testid="cookie-consent-provider" data-requires-consent={String(requiresConsent)}>{children}</div>
        ),
    };
});

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

describe('LocationzationClientProvider (static)', () => {
    beforeEach(() => {
        currentConfig = {};
    });

    it('provides language/messages via context to children', async () => {
        const { setLocaleCache, setMessageForLocaleCache } = await import('../../general/cache_variables');
        const { default: LocationzationClientProvider } = await import('./client_provider_static');
        render(
            <LocationzationClientProvider language="en" messages={{ Common: {} }}>
                <Consumer />
            </LocationzationClientProvider>,
        );
        expect(screen.getByText('en')).toBeInTheDocument();
        expect(setLocaleCache).toHaveBeenCalledWith('en');
        expect(setMessageForLocaleCache).toHaveBeenCalledWith('en', { Common: {} });
    });

    it('renders children directly (no CookieConsentProvider) when cookieConsent is unconfigured', async () => {
        currentConfig = {};
        const { default: LocationzationClientProvider } = await import('./client_provider_static');
        render(
            <LocationzationClientProvider language="en" messages={{ Common: {} }}>
                <span>child</span>
            </LocationzationClientProvider>,
        );
        expect(await screen.findByText('child')).toBeInTheDocument();
        expect(screen.queryByTestId('cookie-consent-provider')).not.toBeInTheDocument();
    });

    it('wraps children in CookieConsentProvider when cookieConsent is configured, without analytics when no analytics resolve', async () => {
        currentConfig = { cookieConsent: {} };
        const { default: LocationzationClientProvider } = await import('./client_provider_static');
        render(
            <LocationzationClientProvider language="en" messages={{ Common: {} }}>
                <span>child</span>
            </LocationzationClientProvider>,
        );
        const provider = await screen.findByTestId('cookie-consent-provider');
        expect(provider).toHaveTextContent('child');
        expect(screen.queryByTestId('cookie-consent-analytics')).not.toBeInTheDocument();
    });

    it('renders CookieConsentAnalytics when analyticsConfig resolves', async () => {
        currentConfig = { cookieConsent: {} };
        const { default: LocationzationClientProvider } = await import('./client_provider_static');
        render(
            <LocationzationClientProvider language="en" messages={{ Common: {} }} analyticsConfig={{ googleAnalyticsId: 'G-XXX' }}>
                <span>child</span>
            </LocationzationClientProvider>,
        );
        expect(await screen.findByTestId('cookie-consent-analytics')).toBeInTheDocument();
    });

    it('passes requiresConsent through to CookieConsentProvider, defaulting to true', async () => {
        currentConfig = { cookieConsent: {} };
        const { default: LocationzationClientProvider } = await import('./client_provider_static');
        render(
            <LocationzationClientProvider language="en" messages={{ Common: {} }}>
                <span>child</span>
            </LocationzationClientProvider>,
        );
        expect(await screen.findByTestId('cookie-consent-provider')).toHaveAttribute('data-requires-consent', 'true');
    });

    it('passes requiresConsent=false through to CookieConsentProvider', async () => {
        currentConfig = { cookieConsent: {} };
        const { default: LocationzationClientProvider } = await import('./client_provider_static');
        render(
            <LocationzationClientProvider language="en" messages={{ Common: {} }} requiresConsent={false}>
                <span>child</span>
            </LocationzationClientProvider>,
        );
        expect(await screen.findByTestId('cookie-consent-provider')).toHaveAttribute('data-requires-consent', 'false');
    });

    it('auto-wires CookieConsentDialog and PrivacyPolicyUpdateDialog by default when cookieConsent is configured', async () => {
        currentConfig = { cookieConsent: {} };
        const { default: LocationzationClientProvider } = await import('./client_provider_static');
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
        const { default: LocationzationClientProvider } = await import('./client_provider_static');
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
        const { default: LocationzationClientProvider } = await import('./client_provider_static');
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
});
