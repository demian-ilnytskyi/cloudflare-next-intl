import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import * as React from 'react';
import AutoFirebasePerformanceEvents from './auto_firebase_performance_events';

let currentPath = '/';
let performanceInstance: object | undefined = {};

vi.mock('next/navigation', () => ({
    usePathname: () => currentPath,
}));

let webVitalsCallback: ((metric: unknown) => void) | undefined;
vi.mock('next/web-vitals', () => ({
    useReportWebVitals: (cb: (metric: unknown) => void) => {
        webVitalsCallback = cb;
    },
}));

const getFirebaseAuthClient = vi.fn(() => Promise.resolve({}));
const getFirebasePerformanceSync = vi.fn(() => performanceInstance);
vi.mock('../firebase_client', () => ({
    getFirebaseAuthClient: (...args: unknown[]) => getFirebaseAuthClient(...args),
    getFirebasePerformanceSync: (...args: unknown[]) => getFirebasePerformanceSync(...args),
}));

const record = vi.fn();
const trace = vi.fn(() => ({ record }));
vi.mock('firebase/performance', () => ({
    trace: (...args: unknown[]) => trace(...args),
}));

const reportError = vi.fn();
vi.mock('../../../error_handling/report_error', () => ({
    default: (...args: unknown[]) => reportError(...args),
}));

type LongTaskEntry = { duration: number };
type ResourceEntry = { duration: number; initiatorType: string; name: string; transferSize?: number };
type ObserverCallback = (list: { getEntries: () => (LongTaskEntry | ResourceEntry)[] }) => void;

let observerCallbacksByType: Record<string, ObserverCallback[]>;
let observeSpy: ReturnType<typeof vi.fn>;
let disconnectSpy: ReturnType<typeof vi.fn>;
let supportedEntryTypes: string[] | undefined;

class FakePerformanceObserver {
    static supportedEntryTypes = supportedEntryTypes;
    private callback: ObserverCallback;
    private type: string | undefined;

    constructor(callback: ObserverCallback) {
        this.callback = callback;
    }

    observe(options: { type: string }, ...rest: unknown[]) {
        this.type = options.type;
        (observerCallbacksByType[options.type] ??= []).push(this.callback);
        observeSpy(options, ...rest);
    }

    disconnect(...args: unknown[]) {
        if (this.type) {
            observerCallbacksByType[this.type] = (observerCallbacksByType[this.type] ?? []).filter(
                (cb) => cb !== this.callback,
            );
        }
        disconnectSpy(...args);
    }
}

function pushLongTask(duration: number) {
    for (const cb of observerCallbacksByType.longtask ?? []) cb({ getEntries: () => [{ duration }] });
}

function pushResource(entry: ResourceEntry) {
    for (const cb of observerCallbacksByType.resource ?? []) cb({ getEntries: () => [entry] });
}

describe('AutoFirebasePerformanceEvents', () => {
    beforeEach(() => {
        currentPath = '/';
        performanceInstance = {};
        webVitalsCallback = undefined;
        getFirebaseAuthClient.mockClear();
        getFirebasePerformanceSync.mockClear();
        trace.mockClear();
        record.mockClear();
        reportError.mockClear();

        observerCallbacksByType = {};
        observeSpy = vi.fn();
        disconnectSpy = vi.fn();
        supportedEntryTypes = ['longtask', 'resource'];
        (FakePerformanceObserver as unknown as { supportedEntryTypes: string[] | undefined }).supportedEntryTypes =
            supportedEntryTypes;
        vi.stubGlobal('PerformanceObserver', FakePerformanceObserver);
    });

    it('renders nothing', () => {
        const { container } = render(<AutoFirebasePerformanceEvents />);
        expect(container).toBeEmptyDOMElement();
    });

    it('does not record a Web Vitals trace when performance is disabled', async () => {
        performanceInstance = undefined;
        render(<AutoFirebasePerformanceEvents />);
        webVitalsCallback?.({ name: 'LCP', value: 1234.5, id: '1', rating: 'good' });
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(trace).not.toHaveBeenCalled();
        expect(record).not.toHaveBeenCalled();
    });

    it('records a Web Vitals trace with the rounded value as duration and rating as an attribute', async () => {
        render(<AutoFirebasePerformanceEvents />);
        webVitalsCallback?.({ name: 'LCP', value: 1234.5, id: '1', rating: 'good' });
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(trace).toHaveBeenCalledWith(performanceInstance, 'web_lcp');
        expect(record).toHaveBeenCalledWith(
            expect.any(Number),
            1235,
            expect.objectContaining({ attributes: { rating: 'good' }, metrics: undefined }),
        );
    });

    it('multiplies CLS by 1000 before rounding for the trace duration', async () => {
        render(<AutoFirebasePerformanceEvents />);
        webVitalsCallback?.({ name: 'CLS', value: 0.12345, id: '2', rating: 'needs-improvement' });
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(trace).toHaveBeenCalledWith(performanceInstance, 'web_cls');
        expect(record).toHaveBeenCalledWith(
            expect.any(Number),
            123,
            expect.objectContaining({ attributes: { rating: 'needs-improvement' } }),
        );
    });

    it('does not fire a route_change trace on the first render', async () => {
        render(<AutoFirebasePerformanceEvents />);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(trace).not.toHaveBeenCalledWith(performanceInstance, 'route_change');
    });

    it('does not fire a route_change trace when performance is disabled', async () => {
        performanceInstance = undefined;
        const { rerender } = render(<AutoFirebasePerformanceEvents />);
        currentPath = '/new-path';
        rerender(<AutoFirebasePerformanceEvents />);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(trace).not.toHaveBeenCalled();
    });

    it('fires a route_change trace with the new path on a path change', async () => {
        const { rerender } = render(<AutoFirebasePerformanceEvents />);
        trace.mockClear();
        record.mockClear();
        currentPath = '/new-path';
        rerender(<AutoFirebasePerformanceEvents />);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(trace).toHaveBeenCalledWith(performanceInstance, 'route_change');
        expect(record).toHaveBeenCalledWith(
            expect.any(Number),
            expect.any(Number),
            expect.objectContaining({ attributes: { path: '/new-path' } }),
        );
    });

    it('truncates a long path to its last 100 characters for the route_change attribute', async () => {
        const { rerender } = render(<AutoFirebasePerformanceEvents />);
        trace.mockClear();
        record.mockClear();
        const longPath = `/${'a'.repeat(150)}`;
        currentPath = longPath;
        rerender(<AutoFirebasePerformanceEvents />);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(record).toHaveBeenCalledWith(
            expect.any(Number),
            expect.any(Number),
            expect.objectContaining({ attributes: { path: longPath.slice(-100) } }),
        );
        expect((record.mock.calls[0][2] as { attributes: { path: string } }).attributes.path).toHaveLength(100);
    });

    it('does not construct an observer when PerformanceObserver is unsupported', () => {
        (FakePerformanceObserver as unknown as { supportedEntryTypes: string[] | undefined }).supportedEntryTypes = [];
        expect(() => render(<AutoFirebasePerformanceEvents />)).not.toThrow();
        expect(observeSpy).not.toHaveBeenCalled();
        expect(observerCallbacksByType.longtask).toBeUndefined();
        expect(observerCallbacksByType.resource).toBeUndefined();
    });

    it('flushes accumulated long tasks as a route_long_tasks trace on route change', async () => {
        const { rerender } = render(<AutoFirebasePerformanceEvents />);
        pushLongTask(60);
        pushLongTask(90);
        trace.mockClear();
        record.mockClear();
        // The route_change and route_long_tasks traces are two independent
        // fire-and-forget calls that both dynamically `import('firebase/performance')`
        // in the same tick. Under this test environment, two concurrent
        // first-in-flight dynamic imports of the same mocked specifier can race
        // and the second one resolve to the real (unmocked) module instead of
        // the mock — a test-harness artifact, not a production concern (in
        // production there's only ever one real module, no mock to bypass).
        // Short-circuit route_change's call here (its own trace is covered by
        // other tests) so only route_long_tasks's import is in flight.
        getFirebasePerformanceSync.mockImplementationOnce(() => undefined);
        currentPath = '/new-path';
        rerender(<AutoFirebasePerformanceEvents />);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(trace).toHaveBeenCalledWith(performanceInstance, 'route_long_tasks');
        expect(record).toHaveBeenCalledWith(
            expect.any(Number),
            150,
            expect.objectContaining({ attributes: { path: '/new-path' }, metrics: { long_task_count: 2 } }),
        );
    });

    it('does not fire a route_long_tasks trace when no long tasks occurred', async () => {
        const { rerender } = render(<AutoFirebasePerformanceEvents />);
        trace.mockClear();
        record.mockClear();
        currentPath = '/new-path';
        rerender(<AutoFirebasePerformanceEvents />);
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(trace).not.toHaveBeenCalledWith(performanceInstance, 'route_long_tasks');
    });

    it('does not record a slow_resource trace for a fetch-initiated resource over threshold', async () => {
        render(<AutoFirebasePerformanceEvents />);
        trace.mockClear();
        record.mockClear();
        pushResource({ duration: 1500, initiatorType: 'fetch', name: '/api/data' });
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(trace).not.toHaveBeenCalledWith(performanceInstance, 'slow_resource');
    });

    it('does not record a slow_resource trace for a non-fetch resource under threshold', async () => {
        render(<AutoFirebasePerformanceEvents />);
        trace.mockClear();
        record.mockClear();
        pushResource({ duration: 500, initiatorType: 'img', name: '/image.png' });
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(trace).not.toHaveBeenCalledWith(performanceInstance, 'slow_resource');
    });

    it('records a slow_resource trace for a non-fetch resource over threshold', async () => {
        render(<AutoFirebasePerformanceEvents />);
        trace.mockClear();
        record.mockClear();
        pushResource({ duration: 1500, initiatorType: 'script', name: '/app.js', transferSize: 2048 });
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(trace).toHaveBeenCalledWith(performanceInstance, 'slow_resource');
        expect(record).toHaveBeenCalledWith(
            expect.any(Number),
            1500,
            expect.objectContaining({
                attributes: { initiator_type: 'script', resource: '/app.js' },
                metrics: { transfer_size_bytes: 2048 },
            }),
        );
    });

    it('defaults transfer_size_bytes metric to 0 when transferSize is undefined', async () => {
        render(<AutoFirebasePerformanceEvents />);
        trace.mockClear();
        record.mockClear();
        pushResource({ duration: 1200, initiatorType: 'img', name: '/large.png' });
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(record).toHaveBeenCalledWith(
            expect.any(Number),
            1200,
            expect.objectContaining({
                attributes: { initiator_type: 'img', resource: '/large.png' },
                metrics: { transfer_size_bytes: 0 },
            }),
        );
    });

    it('truncates a long resource URL to its last 100 characters', async () => {
        render(<AutoFirebasePerformanceEvents />);
        trace.mockClear();
        record.mockClear();
        const longUrl = `https://example.com/${'a'.repeat(150)}.js`;
        pushResource({ duration: 1500, initiatorType: 'script', name: longUrl, transferSize: 100 });
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(record).toHaveBeenCalledWith(
            expect.any(Number),
            expect.any(Number),
            expect.objectContaining({ attributes: { initiator_type: 'script', resource: longUrl.slice(-100) } }),
        );
        expect((record.mock.calls[0][2] as { attributes: { resource: string } }).attributes.resource).toHaveLength(100);
    });

    it('reports errors via reportError when getFirebaseAuthClient or dynamic imports fail', async () => {
        const err = new Error('Network error');
        getFirebaseAuthClient.mockRejectedValueOnce(err);
        render(<AutoFirebasePerformanceEvents />);
        expect(() => {
            webVitalsCallback?.({ name: 'LCP', value: 100, id: '1', rating: 'good' });
        }).not.toThrow();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(trace).not.toHaveBeenCalled();
        expect(reportError).toHaveBeenCalledWith(undefined, {
            error: err,
            classOrMethodName: 'recordFirebaseTrace',
            isClient: true,
        });
    });
});
