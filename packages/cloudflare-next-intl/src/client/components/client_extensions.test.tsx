import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import ClientExtensions from './client_extensions.js';
import { LocaleContext } from './locale_provider.js';
import { useLocale } from 'cloudflare-next-intl-intl/use';

vi.mock('../../cookie_consent/client/cookie_consent_provider.js', () => ({
    default: ({ children }: { children: React.ReactNode }) => <div data-testid="consent-provider">{children}</div>,
}));

vi.mock('../../firebase_auth/client/auth_user_provider.js', () => ({
    default: ({ children }: { children: React.ReactNode }) => <div data-testid="auth-provider">{children}</div>,
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
});
