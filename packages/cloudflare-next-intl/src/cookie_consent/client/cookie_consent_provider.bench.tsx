import { bench, describe, vi } from 'vitest';
import { render, act } from '@testing-library/react';

vi.mock('../../config/intl_config', () => ({
    default: { cookieConsent: { privacyPolicyDate: '2026-07-20' } },
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

const { default: CookieConsentProvider } = await import('./cookie_consent_provider.js');

describe('CookieConsentProvider mount cost', () => {
    bench('cold mount: no stored consent', async () => {
        cookies.clear();
        await act(async () => {
            render(<CookieConsentProvider>{null}</CookieConsentProvider>);
        });
    });

    bench('warm mount: consent already granted and privacy-policy date current', async () => {
        cookies.set('__cookie_consent_key__', 'true');
        cookies.set('__privacy_policy_date_key__', new Date('2027-01-01').toISOString());
        await act(async () => {
            render(<CookieConsentProvider>{null}</CookieConsentProvider>);
        });
    });
});
