import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import LocaleLinkClient from './locale_link_client.js';
import config from '../../config/intl_config.js';

vi.mock('../hooks/use_path_name', () => ({ default: vi.fn(() => '/about') }));
vi.mock('next/navigation', () => ({
    useSearchParams: vi.fn(() => new URLSearchParams('')),
}));
vi.mock('../functions/set_cookie', () => ({ default: vi.fn() }));

beforeEach(async () => {
    vi.stubGlobal('location', { ...window.location, replace: vi.fn(), hash: '' });
    const { useSearchParams } = await import('next/navigation');
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams('') as ReturnType<typeof useSearchParams>);
    const { default: usePathname } = await import('../hooks/use_path_name.js');
    vi.mocked(usePathname).mockReturnValue('/about');
});

afterEach(() => {
    cleanup();
});

describe('LocaleLinkClient', () => {
    it('renders an anchor with a locale-prefixed href for a non-default locale', () => {
        render(<LocaleLinkClient locale="de">Go</LocaleLinkClient>);
        const link = screen.getByRole('link', { name: 'Go' });
        expect(link).toHaveAttribute('href', '/de/about');
        expect(link).toHaveAttribute('hreflang', 'de');
    });

    it('renders an anchor with no locale prefix for the default locale', () => {
        render(<LocaleLinkClient locale={config.defaultLocale}>Go</LocaleLinkClient>);
        const link = screen.getByRole('link', { name: 'Go' });
        expect(link).toHaveAttribute('href', '/about');
    });

    it('appends search params to the href when present', async () => {
        const { useSearchParams } = await import('next/navigation');
        vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams('foo=bar') as ReturnType<typeof useSearchParams>);
        render(<LocaleLinkClient locale="de">Go</LocaleLinkClient>);
        expect(screen.getByRole('link', { name: 'Go' })).toHaveAttribute('href', '/de/about?foo=bar');
    });

    it('renders href without a leading trailing slash for root path with a locale prefix', async () => {
        const { default: usePathname } = await import('../hooks/use_path_name.js');
        vi.mocked(usePathname).mockReturnValue('/');
        render(<LocaleLinkClient locale="de">Home</LocaleLinkClient>);
        expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/de');
    });

    it('sets the locale cookie and navigates on click, preventing default', async () => {
        const setCookie = (await import('../functions/set_cookie.js')).default;
        render(<LocaleLinkClient locale="de">Go</LocaleLinkClient>);
        fireEvent.click(screen.getByRole('link', { name: 'Go' }));
        expect(setCookie).toHaveBeenCalledWith({ name: '__user_locale_key__', value: 'de' });
        expect(window.location.replace).toHaveBeenCalledWith('/de/about');
    });
});
