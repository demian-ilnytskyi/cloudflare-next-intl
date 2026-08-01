import { bench, describe } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLocale, useTranslations } from './client_hooks';
import { LocaleContext } from '../components/client_provider';
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
    bench('reads the language from context', () => {
        renderHook(() => useLocale(), { wrapper });
    });
});

describe('useTranslations (client)', () => {
    bench('builds a namespace-scoped translation function', () => {
        renderHook(() => useTranslations('Common'), { wrapper });
    });
});
