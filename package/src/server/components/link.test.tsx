import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import Link from './link.js';

const mockPush = vi.fn();
const mockPrefetch = vi.fn();

vi.mock('../../general/cache_variables', () => ({ getLocaleCache: vi.fn() }));
vi.mock('next/navigation.js', () => ({
    useRouter: () => ({
        push: mockPush,
        prefetch: mockPrefetch,
        replace: vi.fn(),
    }),
    usePathname: () => '/current',
}));

afterEach(() => {
    cleanup();
    mockPush.mockReset();
    mockPrefetch.mockReset();
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

    it('handles an object href by using its pathname with non-default locale', async () => {
        const { getLocaleCache } = await import('../../general/cache_variables.js');
        vi.mocked(getLocaleCache).mockReturnValue('de');
        render(<Link href={{ pathname: '/about' }}>About</Link>);
        expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/de/about');
    });

    it('handles an object href by using its pathname with default locale', async () => {
        const { getLocaleCache } = await import('../../general/cache_variables.js');
        vi.mocked(getLocaleCache).mockReturnValue('en');
        render(<Link href={{ pathname: '/about' }}>About</Link>);
        expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about');
    });

    it('falls back to an empty pathname when the object href has none', async () => {
        const { getLocaleCache } = await import('../../general/cache_variables.js');
        vi.mocked(getLocaleCache).mockReturnValue('de');
        render(<Link href={{}}>About</Link>);
        expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/de');

        render(<Link href={{ pathname: '' }}>About Empty</Link>);
        expect(screen.getByRole('link', { name: 'About Empty' })).toHaveAttribute('href', '/de');

        render(<Link href="">Empty String</Link>);
        expect(screen.getByRole('link', { name: 'Empty String' })).toHaveAttribute('href', '/de');
    });

    it('handles empty string and empty object href with default locale', async () => {
        const { getLocaleCache } = await import('../../general/cache_variables.js');
        vi.mocked(getLocaleCache).mockReturnValue('en');
        const { container } = render(<Link href="">Default Empty</Link>);
        expect(container.querySelector('a')).toHaveAttribute('href', '');

        const { container: container2 } = render(<Link href={{ pathname: '' }}>Default Obj Empty</Link>);
        expect(container2.querySelector('a')).toHaveAttribute('href', '');
    });

    it('does not prefetch on hover when prefetch is left at its default (false), but pointerdown still prefetches', async () => {
        vi.useFakeTimers();
        const { getLocaleCache } = await import('../../general/cache_variables.js');
        vi.mocked(getLocaleCache).mockReturnValue('en');
        render(<Link href="/test-hover-default-off">Hover Link</Link>);
        const link = screen.getByRole('link', { name: 'Hover Link' });
        fireEvent.mouseEnter(link);
        act(() => {
            vi.advanceTimersByTime(100);
        });
        expect(mockPrefetch).not.toHaveBeenCalled();

        // pointerdown prefetches unconditionally — it only fires when the
        // user has already committed to this link, unlike hover.
        fireEvent.pointerDown(link);
        expect(mockPrefetch).toHaveBeenCalledWith('/test-hover-default-off');

        // navigation itself still works via the loop-safe click interceptor
        fireEvent.click(link);
        expect(mockPush).toHaveBeenCalledWith('/test-hover-default-off');
        vi.useRealTimers();
    });

    it('prefetches route after a hover dwell and on pointerdown when prefetchType is custom', async () => {
        vi.useFakeTimers();
        const { getLocaleCache } = await import('../../general/cache_variables.js');
        vi.mocked(getLocaleCache).mockReturnValue('en');
        render(<Link href="/test-hover" prefetch={true}>Hover Link</Link>);
        const link = screen.getByRole('link', { name: 'Hover Link' });
        fireEvent.mouseEnter(link);
        expect(mockPrefetch).not.toHaveBeenCalled();
        act(() => {
            vi.advanceTimersByTime(100);
        });
        expect(mockPrefetch).toHaveBeenCalledWith('/test-hover');

        // pointerdown also triggers hover prefetch
        fireEvent.pointerDown(link);
        expect(mockPrefetch).toHaveBeenCalledTimes(1); // Deduped in session set
        vi.useRealTimers();
    });

    it('cancels the hover dwell timer on mouseleave before it fires', async () => {
        vi.useFakeTimers();
        const { getLocaleCache } = await import('../../general/cache_variables.js');
        vi.mocked(getLocaleCache).mockReturnValue('en');
        render(<Link href="/test-hover-leave">Hover Leave Link</Link>);
        const link = screen.getByRole('link', { name: 'Hover Leave Link' });
        fireEvent.mouseEnter(link);
        fireEvent.mouseLeave(link);
        act(() => {
            vi.advanceTimersByTime(100);
        });
        expect(mockPrefetch).not.toHaveBeenCalledWith('/test-hover-leave');
        vi.useRealTimers();
    });

    it('ignores prefetch for hash links or when prefetch errors occur', async () => {
        vi.useFakeTimers();
        const { getLocaleCache } = await import('../../general/cache_variables.js');
        vi.mocked(getLocaleCache).mockReturnValue('en');
        mockPrefetch.mockImplementationOnce(() => {
            throw new Error('prefetch failed');
        });
        render(<Link href="#section">Hash Link</Link>);
        const link = screen.getByRole('link', { name: 'Hash Link' });
        fireEvent.mouseEnter(link);
        act(() => {
            vi.advanceTimersByTime(100);
        });
        expect(mockPrefetch).not.toHaveBeenCalled();

        render(<Link href="/error-prefetch">Error Link</Link>);
        const errLink = screen.getByRole('link', { name: 'Error Link' });
        fireEvent.mouseEnter(errLink);
        expect(() => {
            act(() => {
                vi.advanceTimersByTime(100);
            });
        }).not.toThrow();
        vi.useRealTimers();
    });

    it('intercepts click and prevents duplicate navigation when prefetchType is custom', async () => {
        const { getLocaleCache } = await import('../../general/cache_variables.js');
        vi.mocked(getLocaleCache).mockReturnValue('en');
        render(<Link href="/test-click">Click Link</Link>);
        const link = screen.getByRole('link', { name: 'Click Link' });
        fireEvent.click(link);
        expect(mockPush).toHaveBeenCalledTimes(1);
        expect(mockPush).toHaveBeenCalledWith('/test-click');

        // Second click while in-flight is prevented
        fireEvent.click(link);
        expect(mockPush).toHaveBeenCalledTimes(1);
    });

    it('respects defaultPrevented on onClick prop', async () => {
        const { getLocaleCache } = await import('../../general/cache_variables.js');
        vi.mocked(getLocaleCache).mockReturnValue('en');
        const customOnClick = vi.fn((e: React.MouseEvent) => e.preventDefault());
        render(<Link href="/prevented" onClick={customOnClick}>Prevented</Link>);
        const link = screen.getByRole('link', { name: 'Prevented' });
        fireEvent.click(link);
        expect(customOnClick).toHaveBeenCalled();
        expect(mockPush).not.toHaveBeenCalled();
    });

    it('supports prefetchType default without custom prefetch interceptor', async () => {
        const { getLocaleCache } = await import('../../general/cache_variables.js');
        vi.mocked(getLocaleCache).mockReturnValue('en');
        const customOnClick = vi.fn();
        render(<Link href="/test-default" prefetchType="default" onClick={customOnClick}>Default Link</Link>);
        const link = screen.getByRole('link', { name: 'Default Link' });
        fireEvent.mouseEnter(link);
        fireEvent.pointerDown(link);
        expect(mockPrefetch).not.toHaveBeenCalled();

        fireEvent.click(link);
        expect(customOnClick).toHaveBeenCalled();
        expect(mockPush).not.toHaveBeenCalled(); // Handled by default Next link
    });

    it('triggers idle prefetch timer after mount for prefetchType="eager"', async () => {
        vi.useFakeTimers();
        const { getLocaleCache } = await import('../../general/cache_variables.js');
        vi.mocked(getLocaleCache).mockReturnValue('en');
        render(<Link href="/timer-prefetch" prefetchType="eager" prefetch={true}>Timer Link</Link>);
        act(() => {
            vi.advanceTimersByTime(700);
        });
        expect(mockPrefetch).toHaveBeenCalledWith('/timer-prefetch');
        vi.useRealTimers();
    });

    it('does NOT trigger the mount timer for the default prefetchType="custom" (hover-only)', async () => {
        vi.useFakeTimers();
        const { getLocaleCache } = await import('../../general/cache_variables.js');
        vi.mocked(getLocaleCache).mockReturnValue('en');
        render(<Link href="/no-timer-prefetch">No Timer Link</Link>);
        act(() => {
            vi.advanceTimersByTime(700);
        });
        expect(mockPrefetch).not.toHaveBeenCalledWith('/no-timer-prefetch');
        vi.useRealTimers();
    });

    it('calls custom onMouseEnter and onPointerDown handlers and handles object href navigation', async () => {
        const { getLocaleCache } = await import('../../general/cache_variables.js');
        vi.mocked(getLocaleCache).mockReturnValue('en');
        const onMouseEnter = vi.fn();
        const onMouseLeave = vi.fn();
        const onPointerDown = vi.fn();

        render(
            <Link
                href={{ pathname: '/obj-nav', query: { a: '1' } }}
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                onPointerDown={onPointerDown}
            >
                Obj Link
            </Link>
        );

        const link = screen.getByRole('link', { name: 'Obj Link' });
        fireEvent.mouseEnter(link);
        expect(onMouseEnter).toHaveBeenCalled();

        fireEvent.mouseLeave(link);
        expect(onMouseLeave).toHaveBeenCalled();

        fireEvent.pointerDown(link);
        expect(onPointerDown).toHaveBeenCalled();

        fireEvent.click(link);
        expect(mockPush).toHaveBeenCalledWith('/obj-nav');
    });
});
