import { jsx as _jsx } from "react/jsx-runtime";
import { bench, describe, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import usePathname from './use_path_name.js';
import { LocaleContext } from '../components/client_provider.js';
vi.mock('next/navigation', () => ({
    usePathname: vi.fn(() => '/en/about'),
}));
function wrapper({ children }) {
    return (_jsx(LocaleContext.Provider, { value: { language: 'en', messages: {} }, children: children }));
}
describe('usePathname (locale-stripped)', () => {
    bench('strips the locale prefix from the current pathname', () => {
        renderHook(() => usePathname(), { wrapper });
    });
});
