import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import * as React from 'react';
import AutoFirebasePerformanceEvents from './auto_firebase_performance_events.js';

let performanceInstance: object | undefined = {};

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
vi.mock('@firebase/performance', () => ({
    trace: (...args: unknown[]) => trace(...args),
}));

const reportError = vi.fn();
vi.mock('../../../error_handling/report_error', () => ({
    default: (...args: unknown[]) => reportError(...args),
}));

describe('AutoFirebasePerformanceEvents', () => {
    beforeEach(() => {
        performanceInstance = {};
        webVitalsCallback = undefined;
        getFirebaseAuthClient.mockClear();
        getFirebasePerformanceSync.mockClear();
        trace.mockClear();
        record.mockClear();
        reportError.mockClear();
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
