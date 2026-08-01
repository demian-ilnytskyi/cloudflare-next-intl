import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useContext, useEffect, useState } from 'react';
import { LocaleContext } from './client_provider';

vi.mock('../../general/cache_variables', () => ({
    setLocaleCache: vi.fn(),
    setMessageForLocaleCache: vi.fn(),
}));

let currentConfig: { firebaseAuth?: Record<string, unknown> };
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

vi.mock('../../firebase_auth/client/auth_user_provider', () => ({
    default: ({ children }: { children: React.ReactNode }) => <div data-testid="auth-provider">{children}</div>,
}));

function Consumer() {
    const ctx = useContext(LocaleContext);
    return <span>{ctx?.language}</span>;
}

describe('LocationzationClientProvider', () => {
    beforeEach(() => {
        currentConfig = {};
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
});
