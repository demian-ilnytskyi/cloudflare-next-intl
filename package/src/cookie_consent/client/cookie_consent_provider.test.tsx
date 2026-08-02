import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useContext } from 'react';
import { CookieConsentContext } from './cookie_consent_provider';
import type { CookieConsentRoutingConfig } from '../../types/types';

let currentConfig: { cookieConsent?: CookieConsentRoutingConfig };

vi.mock('../../config/intl_config', () => ({
    get default() {
        return currentConfig;
    },
}));

const cookies = new Map<string, string>();

vi.mock('../../client/functions/get_cookie', () => ({
    default: (name: string) => cookies.get(name) ?? null,
}));

vi.mock('../../client/functions/set_cookie', () => ({
    default: ({ name, value }: { name: string; value: string | number | boolean }) => {
        cookies.set(name, String(value));
    },
}));

function Consumer() {
    const ctx = useContext(CookieConsentContext);
    if (!ctx) return null;
    return (
        <div>
            <span data-testid="consent">{ctx.consent === null ? 'null' : String(ctx.consent)}</span>
            <span data-testid="updated">{String(ctx.privacyPolicyUpdated)}</span>
            <span data-testid="privacy-policy-path">{String(ctx.privacyPolicyPath)}</span>
            <button onClick={() => ctx.setConsent(true)}>accept</button>
            <button onClick={() => ctx.setConsent(false)}>decline</button>
            <button onClick={() => ctx.acknowledgePrivacyPolicyUpdate()}>ack</button>
        </div>
    );
}

describe('CookieConsentProvider', () => {
    beforeEach(() => {
        cookies.clear();
        currentConfig = { cookieConsent: {} };
    });

    it('throws when cookieConsent config is missing', async () => {
        currentConfig = {};
        const { default: CookieConsentProvider } = await import('./cookie_consent_provider');
        expect(() => render(<CookieConsentProvider><Consumer /></CookieConsentProvider>)).toThrow(
            /cookieConsent.*is not set/,
        );
    });

    it('starts with consent null when no cookie is stored', async () => {
        const { default: CookieConsentProvider } = await import('./cookie_consent_provider');
        render(<CookieConsentProvider><Consumer /></CookieConsentProvider>);
        expect(screen.getByTestId('consent')).toHaveTextContent('null');
    });

    it('reads a stored true consent cookie', async () => {
        cookies.set('__cookie_consent_key__', 'true');
        const { default: CookieConsentProvider } = await import('./cookie_consent_provider');
        render(<CookieConsentProvider><Consumer /></CookieConsentProvider>);
        expect(screen.getByTestId('consent')).toHaveTextContent('true');
    });

    it('reads a stored false consent cookie', async () => {
        cookies.set('__cookie_consent_key__', 'false');
        const { default: CookieConsentProvider } = await import('./cookie_consent_provider');
        render(<CookieConsentProvider><Consumer /></CookieConsentProvider>);
        expect(screen.getByTestId('consent')).toHaveTextContent('false');
    });

    it('honors custom cookie names and max-age', async () => {
        currentConfig = { cookieConsent: { consentCookieName: 'custom_consent', cookieMaxAge: 60 } };
        const { default: CookieConsentProvider } = await import('./cookie_consent_provider');
        render(<CookieConsentProvider><Consumer /></CookieConsentProvider>);
        await act(async () => {
            screen.getByText('accept').click();
        });
        expect(cookies.get('custom_consent')).toBe('true');
    });

    it('does not check privacy-policy-date when unset even with existing consent', async () => {
        cookies.set('__cookie_consent_key__', 'true');
        const { default: CookieConsentProvider } = await import('./cookie_consent_provider');
        render(<CookieConsentProvider><Consumer /></CookieConsentProvider>);
        expect(screen.getByTestId('updated')).toHaveTextContent('false');
        expect(cookies.has('__privacy_policy_date_key__')).toBe(false);
    });

    it('stamps the privacy-policy-date cookie when consent exists but no date is stored yet', async () => {
        cookies.set('__cookie_consent_key__', 'true');
        currentConfig = { cookieConsent: { privacyPolicyDate: '2026-07-20' } };
        const { default: CookieConsentProvider } = await import('./cookie_consent_provider');
        render(<CookieConsentProvider><Consumer /></CookieConsentProvider>);
        expect(cookies.get('__privacy_policy_date_key__')).toBe(new Date('2026-07-20').toISOString());
        expect(screen.getByTestId('updated')).toHaveTextContent('false');
    });

    it('flags privacyPolicyUpdated when the stored date predates the configured one', async () => {
        cookies.set('__cookie_consent_key__', 'true');
        cookies.set('__privacy_policy_date_key__', '2020-01-01T00:00:00.000Z');
        currentConfig = { cookieConsent: { privacyPolicyDate: '2026-07-20' } };
        const { default: CookieConsentProvider } = await import('./cookie_consent_provider');
        render(<CookieConsentProvider><Consumer /></CookieConsentProvider>);
        expect(screen.getByTestId('updated')).toHaveTextContent('true');
    });

    it('does not flag privacyPolicyUpdated when the stored date is current', async () => {
        cookies.set('__cookie_consent_key__', 'true');
        cookies.set('__privacy_policy_date_key__', '2027-01-01T00:00:00.000Z');
        currentConfig = { cookieConsent: { privacyPolicyDate: '2026-07-20' } };
        const { default: CookieConsentProvider } = await import('./cookie_consent_provider');
        render(<CookieConsentProvider><Consumer /></CookieConsentProvider>);
        expect(screen.getByTestId('updated')).toHaveTextContent('false');
    });

    it('does not flag privacyPolicyUpdated when the stored date is invalid', async () => {
        cookies.set('__cookie_consent_key__', 'true');
        cookies.set('__privacy_policy_date_key__', 'not-a-date');
        currentConfig = { cookieConsent: { privacyPolicyDate: '2026-07-20' } };
        const { default: CookieConsentProvider } = await import('./cookie_consent_provider');
        render(<CookieConsentProvider><Consumer /></CookieConsentProvider>);
        expect(screen.getByTestId('updated')).toHaveTextContent('false');
    });

    it('setConsent persists the consent and privacy-policy-date cookies and clears the update flag', async () => {
        cookies.set('__cookie_consent_key__', 'true');
        cookies.set('__privacy_policy_date_key__', '2020-01-01T00:00:00.000Z');
        currentConfig = { cookieConsent: { privacyPolicyDate: '2026-07-20' } };
        const { default: CookieConsentProvider } = await import('./cookie_consent_provider');
        render(<CookieConsentProvider><Consumer /></CookieConsentProvider>);
        expect(screen.getByTestId('updated')).toHaveTextContent('true');
        await act(async () => {
            screen.getByText('decline').click();
        });
        expect(screen.getByTestId('consent')).toHaveTextContent('false');
        expect(screen.getByTestId('updated')).toHaveTextContent('false');
        expect(cookies.get('__cookie_consent_key__')).toBe('false');
        expect(cookies.get('__privacy_policy_date_key__')).toBe(new Date('2026-07-20').toISOString());
    });

    it('setConsent skips the privacy-policy-date cookie when unconfigured', async () => {
        const { default: CookieConsentProvider } = await import('./cookie_consent_provider');
        render(<CookieConsentProvider><Consumer /></CookieConsentProvider>);
        await act(async () => {
            screen.getByText('accept').click();
        });
        expect(cookies.has('__privacy_policy_date_key__')).toBe(false);
    });

    it('acknowledgePrivacyPolicyUpdate persists the date and clears the flag', async () => {
        cookies.set('__cookie_consent_key__', 'true');
        cookies.set('__privacy_policy_date_key__', '2020-01-01T00:00:00.000Z');
        currentConfig = { cookieConsent: { privacyPolicyDate: '2026-07-20' } };
        const { default: CookieConsentProvider } = await import('./cookie_consent_provider');
        render(<CookieConsentProvider><Consumer /></CookieConsentProvider>);
        expect(screen.getByTestId('updated')).toHaveTextContent('true');
        await act(async () => {
            screen.getByText('ack').click();
        });
        expect(screen.getByTestId('updated')).toHaveTextContent('false');
        expect(cookies.get('__privacy_policy_date_key__')).toBe(new Date('2026-07-20').toISOString());
    });

    it('acknowledgePrivacyPolicyUpdate skips the cookie write when policyDate is unconfigured', async () => {
        cookies.set('__cookie_consent_key__', 'true');
        const { default: CookieConsentProvider } = await import('./cookie_consent_provider');
        render(<CookieConsentProvider><Consumer /></CookieConsentProvider>);
        await act(async () => {
            screen.getByText('ack').click();
        });
        expect(cookies.has('__privacy_policy_date_key__')).toBe(false);
    });

    it('seeds consent to true for a first-time visitor when requiresConsent is false', async () => {
        const { default: CookieConsentProvider } = await import('./cookie_consent_provider');
        render(<CookieConsentProvider requiresConsent={false}><Consumer /></CookieConsentProvider>);
        expect(screen.getByTestId('consent')).toHaveTextContent('true');
        expect(cookies.has('__cookie_consent_key__')).toBe(false);
    });

    it('respects an explicit stored decision even when requiresConsent is false', async () => {
        cookies.set('__cookie_consent_key__', 'false');
        const { default: CookieConsentProvider } = await import('./cookie_consent_provider');
        render(<CookieConsentProvider requiresConsent={false}><Consumer /></CookieConsentProvider>);
        expect(screen.getByTestId('consent')).toHaveTextContent('false');
    });

    it('defaults to requiring consent when requiresConsent is omitted', async () => {
        const { default: CookieConsentProvider } = await import('./cookie_consent_provider');
        render(<CookieConsentProvider><Consumer /></CookieConsentProvider>);
        expect(screen.getByTestId('consent')).toHaveTextContent('null');
    });

    it('defaults privacyPolicyPath to /privacy-policy when unconfigured', async () => {
        const { default: CookieConsentProvider } = await import('./cookie_consent_provider');
        render(<CookieConsentProvider><Consumer /></CookieConsentProvider>);
        expect(screen.getByTestId('privacy-policy-path')).toHaveTextContent('/privacy-policy');
    });

    it('honors a custom privacyPolicyPath', async () => {
        currentConfig = { cookieConsent: { privacyPolicyPath: '/legal/privacy' } };
        const { default: CookieConsentProvider } = await import('./cookie_consent_provider');
        render(<CookieConsentProvider><Consumer /></CookieConsentProvider>);
        expect(screen.getByTestId('privacy-policy-path')).toHaveTextContent('/legal/privacy');
    });

    it('honors privacyPolicyPath set to false', async () => {
        currentConfig = { cookieConsent: { privacyPolicyPath: false } };
        const { default: CookieConsentProvider } = await import('./cookie_consent_provider');
        render(<CookieConsentProvider><Consumer /></CookieConsentProvider>);
        expect(screen.getByTestId('privacy-policy-path')).toHaveTextContent('false');
    });
});
