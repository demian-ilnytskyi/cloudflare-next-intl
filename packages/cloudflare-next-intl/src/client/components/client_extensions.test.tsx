import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { LocaleContext } from './locale_provider.js';
import { useLocale } from 'cloudflare-next-intl-intl/use';

vi.mock('../../cookie_consent/client/cookie_consent_provider.js', () => ({
    default: ({ children }: { children: React.ReactNode }) => <div data-testid="consent-provider">{children}</div>,
}));

vi.mock('../../firebase_auth/client/auth_user_provider.js', () => ({
    default: ({ children }: { children: React.ReactNode }) => <div data-testid="auth-provider">{children}</div>,
}));

vi.mock('../../cookie_consent/client/components/auto_analytics_events.js', () => ({
    default: () => null,
}));

vi.mock('../../cookie_consent/client/components/cookie_consent_dialog.js', () => ({
    default: () => null,
}));

vi.mock('../../cookie_consent/client/components/privacy_policy_update_dialog.js', () => ({
    default: () => null,
}));

function ChildConsumer() {
    const locale = useLocale();
    return <span data-testid="child-locale">{locale}</span>;
}

describe('ClientExtensions', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it('child can call useLocale inside auth + consent wrappers', async () => {
        vi.doMock('../../config/intl_config', () => ({
            default: {
                locales: ['en', 'uk'],
                defaultLocale: 'en',
                firebaseAuth: {},
                cookieConsent: {},
            },
        }));

        const { default: Extensions } = await import('./client_extensions.js');

        render(
            <LocaleContext.Provider value={{ language: 'uk', messages: {} }}>
                <Extensions>
                    <ChildConsumer />
                </Extensions>
            </LocaleContext.Provider>,
        );

        expect(screen.getByTestId('auth-provider')).not.toBeNull();
        expect(screen.getByTestId('consent-provider')).not.toBeNull();
        expect(screen.getByTestId('child-locale').textContent).toBe('uk');
    });

    it('skips AuthUserProvider when skipAuthProvider', async () => {
        vi.doMock('../../config/intl_config', () => ({
            default: {
                locales: ['en', 'uk'],
                defaultLocale: 'en',
                firebaseAuth: {},
            },
        }));

        const { default: Extensions } = await import('./client_extensions.js');

        render(
            <LocaleContext.Provider value={{ language: 'en', messages: {} }}>
                <Extensions skipAuthProvider={true}>
                    <ChildConsumer />
                </Extensions>
            </LocaleContext.Provider>,
        );

        expect(screen.queryByTestId('auth-provider')).toBeNull();
        expect(screen.getByTestId('child-locale').textContent).toBe('en');
    });

    it('no wrappers when neither module configured', async () => {
        vi.doMock('../../config/intl_config', () => ({
            default: {
                locales: ['en', 'uk'],
                defaultLocale: 'en',
            },
        }));

        const { default: Extensions } = await import('./client_extensions.js');

        render(
            <LocaleContext.Provider value={{ language: 'en', messages: {} }}>
                <Extensions>
                    <ChildConsumer />
                </Extensions>
            </LocaleContext.Provider>,
        );

        expect(screen.queryByTestId('auth-provider')).toBeNull();
        expect(screen.queryByTestId('consent-provider')).toBeNull();
        expect(screen.getByTestId('child-locale').textContent).toBe('en');
    });

    it('renders analytics components when configured', async () => {
        vi.doMock('../../config/intl_config', () => ({
            default: {
                locales: ['en'],
                defaultLocale: 'en',
                cookieConsent: {},
                firebaseAuth: { performance: true },
            },
        }));

        const { default: Extensions } = await import('./client_extensions.js');

        render(
            <LocaleContext.Provider value={{ language: 'en', messages: {} }}>
                <Extensions
                    analyticsConfig={{ googleAnalyticsId: 'G-123' }}
                    autoAnalyticsEventsConfig={{}}
                >
                    <ChildConsumer />
                </Extensions>
            </LocaleContext.Provider>,
        );

        expect(screen.getByTestId('consent-provider')).not.toBeNull();
    });

    it.each([
        { googleAdsId: 'AW-1' },
        { googleTagId: 'GT-1' },
        { googleTagId: false as const },
        {},
    ])('renders with analytics config %o', async (analyticsConfig) => {
        vi.doMock('../../config/intl_config', () => ({
            default: {
                locales: ['en'],
                defaultLocale: 'en',
                cookieConsent: {},
            },
        }));

        const { default: Extensions } = await import('./client_extensions.js');

        render(
            <LocaleContext.Provider value={{ language: 'en', messages: {} }}>
                <Extensions analyticsConfig={analyticsConfig}>
                    <ChildConsumer />
                </Extensions>
            </LocaleContext.Provider>,
        );

        expect(screen.getByTestId('consent-provider')).not.toBeNull();
    });

    it('installs console and global overrides and renders client theme script', async () => {
        const installConsoleSpy = vi.fn();
        const installGlobalSpy = vi.fn();
        vi.doMock('../../error_handling/install_console_error_override.js', () => ({
            default: installConsoleSpy,
        }));
        vi.doMock('../../error_handling/install_global_error_override.js', () => ({
            default: installGlobalSpy,
        }));
        vi.doMock('cloudflare-next-intl-theme/ClientThemeScript', () => ({
            default: () => <div data-testid="client-theme-script" />,
        }));

        const { default: Extensions } = await import('./client_extensions.js');

        render(
            <LocaleContext.Provider value={{ language: 'en', messages: {} }}>
                <Extensions>
                    <ChildConsumer />
                </Extensions>
            </LocaleContext.Provider>,
        );

        expect(installConsoleSpy).toHaveBeenCalledWith(expect.anything(), true);
        expect(installGlobalSpy).toHaveBeenCalledWith(expect.anything());
        expect(screen.getByTestId('client-theme-script')).not.toBeNull();
    });
});

