import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLocale, useTranslations } from './client_hooks.js';
import { LocaleContext } from '../components/client_provider.js';
import type { ReactNode } from 'react';

const messages = { Common: { title: 'Hello' } };

function wrapper({ children }: { children: ReactNode }) {
    return (
        <LocaleContext.Provider value={{ language: 'en', messages }}>
            {children}
        </LocaleContext.Provider>
    );
}

describe('useLocale (client)', () => {
    it('returns the language from context', () => {
        const { result } = renderHook(() => useLocale(), { wrapper });
        expect(result.current).toBe('en');
    });

    it('throws when rendered outside the provider', () => {
        const { result } = renderHook(() => {
            try {
                return useLocale();
            } catch (e) {
                return e;
            }
        });
        expect(result.current).toBeInstanceOf(Error);
    });
});

describe('useTranslations (client)', () => {
    it('returns a translation function scoped to the namespace', () => {
        const { result } = renderHook(() => useTranslations('Common'), { wrapper });
        expect(result.current('title')).toBe('Hello');
    });

    it('throws when rendered outside the provider', () => {
        const { result } = renderHook(() => {
            try {
                return useTranslations('Common');
            } catch (e) {
                return e;
            }
        });
        expect(result.current).toBeInstanceOf(Error);
    });
});
