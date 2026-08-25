'use client';

import { useReportWebVitals } from 'next/web-vitals';
import reportError from '../../../error_handling/report_error';
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
    try {
        await getFirebaseAuthClient();
        const performance = getFirebasePerformanceSync();
        if (!performance) return;
        const { trace } = await import('firebase/performance');
        const duration = Math.max(Math.round(durationMs), 1);
        trace(performance, name).record(Date.now() - duration, duration, { attributes, metrics });
    } catch (error) {
        void reportError(undefined, {
            error,
            classOrMethodName: 'recordFirebaseTrace',
            isClient: true,
        });
    }
}

/**
 * Auto-rendered alongside `FirebaseAuthClientProvider` when
 * `firebaseAuth.performance` isn't `false` — records Firebase Performance
 * custom traces for Web Vitals metrics (`web_cls`, `web_fcp`, `web_fid`,
 * `web_lcp`, `web_ttfb`, `web_inp`), alongside Firebase Performance's own
 * automatic page-load/network traces. No-ops if `firebaseAuth.performance`
 * is disabled (`getFirebasePerformanceSync` never resolves an instance).
 */
export default function AutoFirebasePerformanceEvents(): null {
    useReportWebVitals((metric: WebVitalMetric) => {
        const value = Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value);
        void recordFirebaseTrace(`web_${metric.name.toLowerCase()}`, value, { rating: metric.rating });
    });

    return null;
}
