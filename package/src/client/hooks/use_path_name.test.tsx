import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import usePathname from './use_path_name';
import { LocaleContext } from '../components/client_provider';
import type { ReactNode } from 'react';

vi.mock('next/navigation', () => ({
    usePathname: vi.fn(),
}));

function wrapper({ children }: { children: ReactNode }) {
    return (
        <LocaleContext.Provider value={{ language: 'de', messages: {} }}>
            {children}
        </LocaleContext.Provider>
    );
}

describe('usePathname (locale-stripped)', () => {
    it('strips the locale prefix from the current pathname', async () => {
        const { usePathname: nextUsePathname } = await import('next/navigation');
        vi.mocked(nextUsePathname).mockReturnValue('/de/about');
        const { result } = renderHook(() => usePathname(), { wrapper });
        expect(result.current).toBe('/about');
    });

    it('returns "/" when the stripped path is empty', async () => {
        const { usePathname: nextUsePathname } = await import('next/navigation');
        vi.mocked(nextUsePathname).mockReturnValue('/de');
        const { result } = renderHook(() => usePathname(), { wrapper });
        expect(result.current).toBe('/');
    });
});
