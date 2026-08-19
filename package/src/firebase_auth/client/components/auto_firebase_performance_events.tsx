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
    }, [path]);

    return null;
}
