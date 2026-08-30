import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Link from './link.js';

vi.mock('../../general/cache_variables', () => ({ getLocaleCache: vi.fn() }));

afterEach(() => {
    cleanup();
});

describe('Link (server-safe locale-aware)', () => {
    it('prepends the locale segment for a non-default cached locale', async () => {
        const { getLocaleCache } = await import('../../general/cache_variables.js');
        vi.mocked(getLocaleCache).mockReturnValue('de');
        render(<Link href="/about">About</Link>);
        expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/de/about');
    });

    it('does not prepend a locale segment for the default cached locale', async () => {
        const { getLocaleCache } = await import('../../general/cache_variables.js');
        vi.mocked(getLocaleCache).mockReturnValue('en');
        render(<Link href="/about">About</Link>);
        expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about');
    });

    it('prepends a locale segment when no locale is cached at all', async () => {
        const { getLocaleCache } = await import('../../general/cache_variables.js');
        vi.mocked(getLocaleCache).mockReturnValue(undefined);
        render(<Link href="/about">About</Link>);
        expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/undefined/about');
    });

    it('handles an object href by using its pathname', async () => {
        const { getLocaleCache } = await import('../../general/cache_variables.js');
        vi.mocked(getLocaleCache).mockReturnValue('de');
        render(<Link href={{ pathname: '/about' }}>About</Link>);
        expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/de/about');
    });

    it('falls back to an empty pathname when the object href has none', async () => {
        const { getLocaleCache } = await import('../../general/cache_variables.js');
        vi.mocked(getLocaleCache).mockReturnValue('de');
        render(<Link href={{}}>About</Link>);
        expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/de');
    });
});
