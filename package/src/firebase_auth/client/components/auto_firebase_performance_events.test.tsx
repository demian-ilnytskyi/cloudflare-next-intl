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

describe('AutoFirebasePerformanceEvents', () => {
    beforeEach(() => {
        currentPath = '/';
        performanceInstance = {};
        webVitalsCallback = undefined;
        getFirebaseAuthClient.mockClear();
        getFirebasePerformanceSync.mockClear();
        trace.mockClear();
        record.mockClear();
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
});
