import { jsx as _jsx } from "react/jsx-runtime";
import { bench, describe } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLocale, useTranslations } from './client_hooks.js';
import { LocaleContext } from '../components/client_provider.js';
const messages = { Common: { title: 'Hello' } };
function wrapper({ children }) {
    return (_jsx(LocaleContext.Provider, { value: { language: 'en', messages }, children: children }));
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
