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
vi.mock('@intl-config', () => ({
    get default() {
        return { locales: ['en', 'de'], defaultLocale: 'en', firebaseAuth: firebaseAuthValue };
    },
}));

vi.mock('../../firebase_auth/server/auth_user_server_provider', () => ({
    resolveAuthUserAndRedirect: vi.fn(async () => ({ uid: 'server-user', email: null, emailVerified: true, displayName: null })),
}));

vi.mock('../../firebase_auth/client/auth_user_provider', () => ({
    default: ({ children }: { children: React.ReactNode }) => <div data-testid="auth-provider">{children}</div>,
}));

describe('LocationzationProvider', () => {
    beforeEach(() => {
        firebaseAuthValue = undefined;
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
});
