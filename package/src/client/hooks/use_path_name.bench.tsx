import { bench, describe, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import usePathname from './use_path_name.js';
import { LocaleContext } from '../components/client_provider.js';
import type { ReactNode } from 'react';

vi.mock('next/navigation', () => ({
    usePathname: vi.fn(() => '/en/about'),
}));

function wrapper({ children }: { children: ReactNode }) {
    return (
        <LocaleContext.Provider value={{ language: 'en', messages: {} }}>
            {children}
        </LocaleContext.Provider>
    );
}

describe('usePathname (locale-stripped)', () => {
    bench('strips the locale prefix from the current pathname', () => {
        renderHook(() => usePathname(), { wrapper });
    });
});
