import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import HelperScript from './helper_script.js';

afterEach(() => {
    cleanup();
});

describe('HelperScript', () => {
    it('renders a Content-Language meta tag for the given locale', () => {
        render(<HelperScript locale="de" />);
        expect(document.head.querySelector('meta[http-equiv="Content-Language"]')).toHaveAttribute('content', 'de');
    });

    it('omits the Content-Language meta tag when no locale prop is given', () => {
        render(<HelperScript />);
        expect(document.head.querySelector('meta[http-equiv="Content-Language"]')).toBeNull();
    });

    it('omits dns-prefetch and preconnect hints when none provided', () => {
        render(<HelperScript />);
        expect(document.head.querySelector('link[rel="dns-prefetch"]')).toBeNull();
        expect(document.head.querySelector('link[rel="preconnect"]')).toBeNull();
    });

    it('renders prefetch and preconnect links in order', () => {
        render(
            <HelperScript
                prefetchOrigins={['https://a', 'https://b']}
                preconnectOrigins={['https://c']}
            />,
        );
        const prefetches = Array.from(document.head.querySelectorAll('link[rel="dns-prefetch"]')).map((el) => el.getAttribute('href'));
        const preconnects = Array.from(document.head.querySelectorAll('link[rel="preconnect"]')).map((el) => el.getAttribute('href'));
        expect(prefetches).toEqual(['https://a', 'https://b']);
        expect(preconnects).toEqual(['https://c']);
    });

    it('renders children before the locale script', () => {
        const { container } = render(
            <HelperScript>
                <div id="theme-child">theme</div>
                <div id="error-child">error</div>
            </HelperScript>,
        );
        const nodes = Array.from(container.childNodes);
        const themeIdx = nodes.findIndex((n) => (n as HTMLElement).id === 'theme-child');
        const errorIdx = nodes.findIndex((n) => (n as HTMLElement).id === 'error-child');
        const scriptIdx = nodes.findIndex((n) => (n as HTMLElement).id === 'intl-app-state-checker');

        expect(themeIdx).toBeGreaterThanOrEqual(0);
        expect(errorIdx).toBeGreaterThan(themeIdx);
        expect(scriptIdx).toBeGreaterThan(errorIdx);
    });

    it('renders the app-state-checker script with locale redirect logic', () => {
        const { container } = render(<HelperScript />);
        const script = container.querySelector('#intl-app-state-checker');
        expect(script).not.toBeNull();
        expect(script?.id).toBe('intl-app-state-checker');
        expect(script?.textContent).toContain('locale');
    });

    it('redirects to localized route when locale cookie differs from current path', () => {
        const { container } = render(<HelperScript />);
        const script = container.querySelector('#intl-app-state-checker');
        const scriptContent = script?.textContent ?? '';

        document.cookie = '__user_locale_key__=de; path=/';
        const locationMock = {
            pathname: '/about',
            search: '?tab=1',
            hash: '#info',
            href: 'https://example.com/about?tab=1#info',
        };
        Object.defineProperty(window, 'location', {
            value: locationMock,
            writable: true,
            configurable: true,
        });

        new Function(scriptContent)();
        expect(locationMock.href).toBe('/de/about?tab=1#info');
    });

    it('cleans up _stale_reload search param if present', () => {
        const { container } = render(<HelperScript />);
        const script = container.querySelector('#intl-app-state-checker');
        const scriptContent = script?.textContent ?? '';

        document.cookie = '__user_locale_key__=en; path=/';
        const replaceState = vi.fn();
        const locationMock = {
            pathname: '/en',
            search: '?_stale_reload=12345',
            hash: '',
            href: 'https://example.com/en?_stale_reload=12345',
        };
        Object.defineProperty(window, 'location', {
            value: locationMock,
            writable: true,
            configurable: true,
        });
        window.history.replaceState = replaceState;

        new Function(scriptContent)();
        expect(replaceState).toHaveBeenCalledWith(window.history.state, '', '/en');
    });

    it('swallows errors during app state check', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { container } = render(<HelperScript />);
        const script = container.querySelector('#intl-app-state-checker');
        const scriptContent = script?.textContent ?? '';

        Object.defineProperty(window, 'location', {
            get() { throw new Error('location boom'); },
            configurable: true,
        });

        try {
            new Function(scriptContent)();
            expect(spy).toHaveBeenCalledWith('App State check Script Error:', expect.any(Error));
        } finally {
            spy.mockRestore();
        }
    });
});
