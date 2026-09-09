import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

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
    default: () => function Noop() { return null; },
}));

// Freezes the pending window `useLazyWrappingProvider` deliberately keeps
// `children` mounted for: the returned Provider renders bare children and
// never resolves, exactly as it behaves while the real provider's chunk is
// still downloading.
vi.mock('./use_lazy_wrapping_provider', () => ({
    default: () => ({
        Provider: ({ children }: { children?: React.ReactNode }) => children,
        isReady: false,
    }),
}));

describe('LocationzationClientProvider — auth provider still loading', () => {
    beforeEach(() => {
        currentConfig = { firebaseAuth: {} };
    });

    // Regression: a child calling useAuthUser() during that window hit the
    // context's `null` default and threw "useAuthUser must be used within an
    // AuthUserProvider", which the nearest error boundary turned into a
    // flash of the error page on every page load.
    it('serves useAuthUser the seed value instead of throwing', async () => {
        const { default: LocationzationClientProvider } = await import('./client_provider.js');
        const { default: useAuthUser } = await import('../../firebase_auth/client/use_auth_user.js');

        function Consumer() {
            const { user, loading } = useAuthUser();
            return <span>{`${user?.uid ?? 'none'}:${loading}`}</span>;
        }

        render(
            <LocationzationClientProvider language="en" messages={{ Common: {} }} initialAuthUser={null}>
                <Consumer />
            </LocationzationClientProvider>,
        );

        expect(screen.getByText('none:true')).toBeInTheDocument();
    });

    it('seeds the server-resolved user so nothing changes once the real provider takes over', async () => {
        const { default: LocationzationClientProvider } = await import('./client_provider.js');
        const { default: useAuthUser } = await import('../../firebase_auth/client/use_auth_user.js');

        function Consumer() {
            const { user, loading } = useAuthUser();
            return <span>{`${user?.uid ?? 'none'}:${loading}`}</span>;
        }

        render(
            <LocationzationClientProvider
                language="en"
                messages={{ Common: {} }}
                initialAuthUser={{ uid: 'u1', email: 'a@b.c', emailVerified: true, displayName: null, photoURL: null }}>
                <Consumer />
            </LocationzationClientProvider>,
        );

        expect(screen.getByText('u1:false')).toBeInTheDocument();
    });
});
