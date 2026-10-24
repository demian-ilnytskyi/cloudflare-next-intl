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

let clientMessagesValue: boolean | string[] | undefined;
vi.mock('@intl-config', () => ({
    get default() {
        return { locales: ['en', 'de'], defaultLocale: 'en', clientMessages: clientMessagesValue };
    },
}));

describe('LocationzationProvider (static, core)', () => {
    beforeEach(() => {
        clientMessagesValue = undefined;
    });

    it('renders children through the client provider when messages are provided', async () => {
        const { default: LocationzationProvider } = await import('./server_provider_static.js');
        render(await LocationzationProvider({ language: 'en', messages: { Common: {} }, children: <span>child</span> }));
        expect(await screen.findByText('child')).toBeInTheDocument();
    });

    it('loads messages via getMessage when none are provided', async () => {
        const { getMessage } = await import('../functions/server.js');
        const { default: LocationzationProvider } = await import('./server_provider_static.js');
        render(await LocationzationProvider({ language: 'en', children: <span>child</span> }));
        expect(getMessage).toHaveBeenCalledWith('en');
    });

    it('calls notFound() for an unconfigured locale', async () => {
        const { default: LocationzationProvider } = await import('./server_provider_static.js');
        await expect(
            LocationzationProvider({ language: 'zz', children: <span>child</span> }),
        ).rejects.toThrow();
    });
});
