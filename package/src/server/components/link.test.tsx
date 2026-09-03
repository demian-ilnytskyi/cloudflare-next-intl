import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import Link, { PENDING_NAVIGATION_EVENT } from './link.js';

const mockPush = vi.fn();
const mockPrefetch = vi.fn();
const mockUsePathname = vi.fn(() => '/current');

vi.mock('../../general/cache_variables', () => ({ getLocaleCache: vi.fn() }));
vi.mock('next/navigation.js', () => ({
    useRouter: () => ({
        push: mockPush,
        prefetch: mockPrefetch,
        replace: vi.fn(),
    }),
    usePathname: () => mockUsePathname(),
}));

afterEach(() => {
    cleanup();
    mockPush.mockReset();
    mockPrefetch.mockReset();
    mockUsePathname.mockReturnValue('/current');
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

    it('falls back to the unprefixed default-locale href when no locale is cached at all', async () => {
        // Regression test: an unset cache (a mid-hydration race, a
        // lazily-loaded provider chunk that hasn't run yet, a duplicated
        // module instance from a dev-server re-optimize) used to produce
        // `/undefined/about` — a broken href, not just a wrong one.
        const { getLocaleCache } = await import('../../general/cache_variables.js');
        vi.mocked(getLocaleCache).mockReturnValue(undefined);
        render(<Link href="/about">About</Link>);
        expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about');
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

    it('hover-prefetches by default (100ms dwell) and on pointerdown', async () => {
        vi.useFakeTimers();
        const { getLocaleCache } = await import('../../general/cache_variables.js');
        vi.mocked(getLocaleCache).mockReturnValue('en');
        render(<Link href="/test-hover">Hover Link</Link>);
        const link = screen.getByRole('link', { name: 'Hover Link' });
        fireEvent.mouseEnter(link);
        expect(mockPrefetch).not.toHaveBeenCalled();
        act(() => {
            vi.advanceTimersByTime(100);
        });
        expect(mockPrefetch).toHaveBeenCalledWith('/test-hover');

        // pointerdown also triggers prefetch, deduped in the session set
        fireEvent.pointerDown(link);
        expect(mockPrefetch).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
    });

    it('prefetches immediately on hover when hoverPrefetchDelayMs={0}', async () => {
        const { getLocaleCache } = await import('../../general/cache_variables.js');
        vi.mocked(getLocaleCache).mockReturnValue('en');
        render(<Link href="/test-hover-zero-delay" hoverPrefetchDelayMs={0}>Hover Link</Link>);
        const link = screen.getByRole('link', { name: 'Hover Link' });
        fireEvent.mouseEnter(link);
        expect(mockPrefetch).toHaveBeenCalledWith('/test-hover-zero-delay');
    });

    it('respects a custom non-default hoverPrefetchDelayMs', async () => {
        vi.useFakeTimers();
        const { getLocaleCache } = await import('../../general/cache_variables.js');
        vi.mocked(getLocaleCache).mockReturnValue('en');
        render(<Link href="/test-hover-custom-delay" hoverPrefetchDelayMs={300}>Hover Link</Link>);
        const link = screen.getByRole('link', { name: 'Hover Link' });
        fireEvent.mouseEnter(link);
        act(() => {
            vi.advanceTimersByTime(100);
        });
        expect(mockPrefetch).not.toHaveBeenCalled();
        act(() => {
            vi.advanceTimersByTime(200);
        });
        expect(mockPrefetch).toHaveBeenCalledWith('/test-hover-custom-delay');
        vi.useRealTimers();
    });

    it('does not hover-prefetch when prefetch={false}, but pointerdown still prefetches (already committed to the click)', async () => {
        vi.useFakeTimers();
        const { getLocaleCache } = await import('../../general/cache_variables.js');
        vi.mocked(getLocaleCache).mockReturnValue('en');
        render(<Link href="/test-hover-off" prefetch={false}>Hover Link</Link>);
        const link = screen.getByRole('link', { name: 'Hover Link' });
        fireEvent.mouseEnter(link);
        act(() => {
            vi.advanceTimersByTime(100);
        });
        expect(mockPrefetch).not.toHaveBeenCalled();

        fireEvent.pointerDown(link);
        expect(mockPrefetch).toHaveBeenCalledWith('/test-hover-off');

        // navigation itself still works via the loop-safe click interceptor
        fireEvent.click(link);
        expect(mockPush).toHaveBeenCalledWith('/test-hover-off');
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

    it('dispatches PENDING_NAVIGATION_EVENT on click and again with null once pathname catches up, but not on initial mount', async () => {
        const { getLocaleCache } = await import('../../general/cache_variables.js');
        vi.mocked(getLocaleCache).mockReturnValue('en');
        const events: (string | null)[] = [];
        const listener = (e: Event) => events.push((e as CustomEvent<string | null>).detail);
        window.addEventListener(PENDING_NAVIGATION_EVENT, listener);

        const { rerender } = render(<Link href="/test-pending">Pending Link</Link>);
        expect(events).toEqual([]); // no "landed" event on initial mount

        const link = screen.getByRole('link', { name: 'Pending Link' });
        fireEvent.click(link);
        expect(events).toEqual(['/test-pending']);

        mockUsePathname.mockReturnValue('/test-pending');
        rerender(<Link href="/test-pending">Pending Link</Link>);
        expect(events).toEqual(['/test-pending', null]);

        window.removeEventListener(PENDING_NAVIGATION_EVENT, listener);
    });

    it('lets the browser handle modified clicks and non-primary mouse buttons instead of intercepting', async () => {
        const { getLocaleCache } = await import('../../general/cache_variables.js');
        vi.mocked(getLocaleCache).mockReturnValue('en');
        render(<Link href="/test-modified-click">Modified Link</Link>);
        const link = screen.getByRole('link', { name: 'Modified Link' });

        fireEvent.click(link, { metaKey: true });
        fireEvent.click(link, { ctrlKey: true });
        fireEvent.click(link, { shiftKey: true });
        fireEvent.click(link, { altKey: true });
        fireEvent.click(link, { button: 1 });

        expect(mockPush).not.toHaveBeenCalled();
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
        render(<Link href="/timer-prefetch" prefetchType="eager">Timer Link</Link>);
        act(() => {
            vi.advanceTimersByTime(100);
        });
        expect(mockPrefetch).toHaveBeenCalledWith('/timer-prefetch');
        vi.useRealTimers();
    });

    it('does NOT trigger the mount timer for prefetchType="custom" (hover/pointerdown only)', async () => {
        vi.useFakeTimers();
        const { getLocaleCache } = await import('../../general/cache_variables.js');
        vi.mocked(getLocaleCache).mockReturnValue('en');
        render(<Link href="/no-timer-prefetch">No Timer Link</Link>);
        act(() => {
            vi.advanceTimersByTime(100);
        });
        expect(mockPrefetch).not.toHaveBeenCalledWith('/no-timer-prefetch');
        vi.useRealTimers();
    });

    it('calls custom onMouseEnter, onMouseLeave and onPointerDown handlers and handles object href navigation', async () => {
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

describe('Link with link.defaultPrefetch: true in intl config', () => {
    afterEach(() => {
        vi.doUnmock('../../config/intl_config.js');
        vi.resetModules();
    });

    it('hover-prefetches by default when the app config sets link.defaultPrefetch: true', async () => {
        vi.resetModules();
        vi.doMock('../../config/intl_config.js', () => ({
            default: { locales: ['en'], defaultLocale: 'en', link: { defaultPrefetch: true } },
        }));
        vi.useFakeTimers();
        const { getLocaleCache } = await import('../../general/cache_variables.js');
        vi.mocked(getLocaleCache).mockReturnValue('en');
        const { default: ConfiguredLink } = await import('./link.js');
        render(<ConfiguredLink href="/config-default-prefetch">Configured Link</ConfiguredLink>);
        const link = screen.getByRole('link', { name: 'Configured Link' });
        fireEvent.mouseEnter(link);
        act(() => {
            vi.advanceTimersByTime(100);
        });
        expect(mockPrefetch).toHaveBeenCalledWith('/config-default-prefetch');
        vi.useRealTimers();
    });

    it('an explicit prefetch={false} on the Link still wins over link.defaultPrefetch: true', async () => {
        vi.resetModules();
        vi.doMock('../../config/intl_config.js', () => ({
            default: { locales: ['en'], defaultLocale: 'en', link: { defaultPrefetch: true } },
        }));
        vi.useFakeTimers();
        const { getLocaleCache } = await import('../../general/cache_variables.js');
        vi.mocked(getLocaleCache).mockReturnValue('en');
        const { default: ConfiguredLink } = await import('./link.js');
        render(<ConfiguredLink href="/config-default-prefetch-override" prefetch={false}>Configured Link</ConfiguredLink>);
        const link = screen.getByRole('link', { name: 'Configured Link' });
        fireEvent.mouseEnter(link);
        act(() => {
            vi.advanceTimersByTime(100);
        });
        expect(mockPrefetch).not.toHaveBeenCalled();
        vi.useRealTimers();
    });
});
