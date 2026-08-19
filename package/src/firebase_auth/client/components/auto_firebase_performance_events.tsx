'use client';

import { usePathname } from 'next/navigation';
import { useReportWebVitals } from 'next/web-vitals';
import { useEffect, useRef } from 'react';
import { getFirebaseAuthClient, getFirebasePerformanceSync } from '../firebase_client';

interface WebVitalMetric {
    name: 'CLS' | 'FCP' | 'FID' | 'LCP' | 'TTFB' | 'INP';
    value: number;
    id: string;
    rating: 'good' | 'needs-improvement' | 'poor';
}

/**
 * Records a Firebase Performance custom trace with a real duration, so
 * Firebase's own duration histograms/percentiles are meaningful. No-ops if
 * `firebaseAuth.performance` is disabled (`getFirebasePerformanceSync` never
 * resolves an instance).
 */
async function recordFirebaseTrace(
    name: string,
    durationMs: number,
    attributes?: Record<string, string>,
    metrics?: Record<string, number>,
): Promise<void> {
    await getFirebaseAuthClient();
    const performance = getFirebasePerformanceSync();
    if (!performance) return;
    const { trace } = await import('firebase/performance');
    const duration = Math.max(Math.round(durationMs), 1);
    trace(performance, name).record(Date.now() - duration, duration, { attributes, metrics });
}

const SLOW_RESOURCE_THRESHOLD_MS = 1000;

/**
 * Auto-rendered alongside `FirebaseAuthClientProvider` when
 * `firebaseAuth.performance` isn't `false` — records Firebase Performance
 * custom traces for Web Vitals metrics (`web_cls`, `web_fcp`, `web_fid`,
 * `web_lcp`, `web_ttfb`, `web_inp`) and SPA route changes (`route_change`),
 * alongside Firebase Performance's own automatic page-load/network traces.
 * No-ops if `firebaseAuth.performance` is disabled (`getFirebasePerformanceSync`
 * never resolves an instance).
 */
export default function AutoFirebasePerformanceEvents(): null {
    useReportWebVitals((metric: WebVitalMetric) => {
        const value = Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value);
        void recordFirebaseTrace(`web_${metric.name.toLowerCase()}`, value, { rating: metric.rating });
    });

    const path = usePathname();
    const isFirstRoute = useRef(true);
    const lastRouteChangeRef = useRef(Date.now());
    const longTaskStats = useRef({ count: 0, totalDuration: 0 });

    // Mount-only: registers a PerformanceObserver for long tasks (main-thread
    // blocks >= 50ms). Not all browsers support the 'longtask' entry type, so
    // this is a best-effort signal. The final route's tail of accumulated
    // long tasks between the last route change and unmount is intentionally
    // dropped rather than flushed here — this is a monitoring signal, not a
    // billing metric, and an occasional dropped tail sample is acceptable.
    useEffect(() => {
        if (typeof PerformanceObserver === 'undefined' || !PerformanceObserver.supportedEntryTypes?.includes('longtask')) return;
        const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                longTaskStats.current.count += 1;
                longTaskStats.current.totalDuration += entry.duration;
            }
        });
        observer.observe({ type: 'longtask', buffered: true });
        return () => observer.disconnect();
    }, []);

    // Mount-only: registers a PerformanceObserver for slow non-fetch/XHR
    // resources (scripts, images, stylesheets, fonts, etc). Firebase
    // Performance's own automatic network monitoring already instruments
    // fetch/XHR, so those are skipped here to avoid duplicate signals.
    // `buffered: true` also catches resources that loaded before this
    // component mounted (it only mounts after `AuthUserProvider`).
    useEffect(() => {
        if (typeof PerformanceObserver === 'undefined' || !PerformanceObserver.supportedEntryTypes?.includes('resource')) return;
        const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
                if (entry.initiatorType === 'fetch' || entry.initiatorType === 'xmlhttprequest') continue;
                if (entry.duration < SLOW_RESOURCE_THRESHOLD_MS) continue;
                void recordFirebaseTrace('slow_resource', entry.duration, {
                    initiator_type: entry.initiatorType,
                    resource: entry.name.slice(-100),
                }, { transfer_size_bytes: Math.round(entry.transferSize ?? 0) });
            }
        });
        observer.observe({ type: 'resource', buffered: true });
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const now = Date.now();
        const duration = now - lastRouteChangeRef.current;
        lastRouteChangeRef.current = now;
        if (isFirstRoute.current) {
            isFirstRoute.current = false;
            return;
        }
        // Approximates navigation duration as time between path-change commits —
        // App Router exposes no public "navigation start" event this package
        // can hook into, so this is not a precise navigation timing.
        void recordFirebaseTrace('route_change', duration, { path: path.slice(-100) });

        const { count, totalDuration } = longTaskStats.current;
        longTaskStats.current = { count: 0, totalDuration: 0 };
        if (count > 0) {
            void recordFirebaseTrace('route_long_tasks', totalDuration, { path }, { long_task_count: count });
        }
    }, [path]);

    return null;
}
