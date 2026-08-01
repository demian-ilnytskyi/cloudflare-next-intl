import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import LocationzationClientProvider, { LocaleContext } from './client_provider';
import { useContext } from 'react';

vi.mock('../../general/cache_variables', () => ({
    setLocaleCache: vi.fn(),
    setMessageForLocaleCache: vi.fn(),
}));

function Consumer() {
    const ctx = useContext(LocaleContext);
    return <span>{ctx?.language}</span>;
}

describe('LocationzationClientProvider', () => {
    it('provides language/messages via context to children', async () => {
        const { setLocaleCache, setMessageForLocaleCache } = await import('../../general/cache_variables');
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
