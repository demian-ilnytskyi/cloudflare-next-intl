import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useContext } from 'react';
import { LocaleContext } from './client_provider.js';

vi.mock('../../general/cache_variables', () => ({
    setLocaleCache: vi.fn(),
    setMessageForLocaleCache: vi.fn(),
}));

const { currentConfig } = vi.hoisted(() => ({
    currentConfig: { locales: ['en', 'de'], defaultLocale: 'en' } as Record<string, unknown>,
}));

vi.mock('@intl-config', () => ({
    get default() {
        return currentConfig;
    },
}));

function Consumer() {
    const ctx = useContext(LocaleContext);
    return <span>{ctx?.language}</span>;
}

describe('LocationzationClientProvider', () => {

    it('provides language/messages via context to children', async () => {
        const { setLocaleCache, setMessageForLocaleCache } = await import('../../general/cache_variables.js');
        const { default: LocationzationClientProvider } = await import('./client_provider.js');
        render(
            <LocationzationClientProvider language="en" messages={{ Common: {} }}>
                <Consumer />
            </LocationzationClientProvider>,
        );
        expect(screen.getByText('en')).toBeInTheDocument();
        expect(setLocaleCache).toHaveBeenCalledWith('en');
        expect(setMessageForLocaleCache).toHaveBeenCalledWith('en', { Common: {} });
    });
});
