import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React, { useContext } from 'react';

vi.mock('../../config/intl_config.js', () => ({
    default: {
        locales: ['en', 'uk'],
        defaultLocale: 'en',
        firebaseAuth: {},
        cookieConsent: {},
    },
}));

import LocationzationClientProvider, { LocaleContext, type LocationzationClientProviderProps } from './client_provider.js';

vi.mock('../../cookie_consent/client/cookie_consent_provider.js', () => ({
    default: ({ children }: { children: React.ReactNode }) => <div data-testid="consent-provider">{children}</div>,
}));

vi.mock('../../firebase_auth/client/auth_user_provider.js', () => ({
    default: ({ children }: { children: React.ReactNode }) => <div data-testid="auth-provider">{children}</div>,
}));

vi.mock('../../cookie_consent/client/components/auto_analytics_events.js', () => ({
    default: () => <div data-testid="auto-analytics" />,
}));

function Consumer() {
    const ctx = useContext(LocaleContext);
    return <span data-testid="consumer-locale">{ctx?.language}</span>;
}

describe('LocationzationClientProvider (umbrella)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders with default props and wraps core provider with extensions', () => {
        render(
            <LocationzationClientProvider language="uk" messages={{ Common: { ok: 'Гаразд' } }}>
                <Consumer />
            </LocationzationClientProvider>,
        );

        expect(screen.getByTestId('consumer-locale').textContent).toBe('uk');
        expect(screen.getByTestId('auth-provider')).toBeInTheDocument();
        expect(screen.getByTestId('consent-provider')).toBeInTheDocument();
    });

    it('forwards all custom extension props to ClientExtensions', () => {
        render(
            <LocationzationClientProvider
                language="en"
                messages={{}}
                initialAuthUser={{ uid: 'user_123' } as unknown as LocationzationClientProviderProps['initialAuthUser']}
                skipAuthProvider={true}
                requiresConsent={false}
                autoWireDialogs={false}
                analyticsConfig={{ googleAnalyticsId: 'G-123' }}
                autoAnalyticsEventsConfig={{ pageViews: true }}
                dialogProps={{ title: 'Cookies' } as unknown as LocationzationClientProviderProps['dialogProps']}
                updateDialogProps={{ title: 'Update' } as unknown as LocationzationClientProviderProps['updateDialogProps']}
            >
                <div data-testid="custom-child">Hello</div>
            </LocationzationClientProvider>,
        );

        expect(screen.getByTestId('custom-child')).toBeInTheDocument();
        // Since skipAuthProvider is true, auth-provider should not be rendered
        expect(screen.queryByTestId('auth-provider')).toBeNull();
    });
});
