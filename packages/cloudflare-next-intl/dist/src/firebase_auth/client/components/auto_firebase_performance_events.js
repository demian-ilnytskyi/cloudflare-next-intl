'use client';
import { useReportWebVitals } from 'next/web-vitals';
import reportError from '../../../error_handling/report_error.js';
import { getFirebaseAuthClient, getFirebasePerformanceSync } from '../firebase_client.js';
async function recordFirebaseTrace(name, durationMs, attributes, metrics) {
    try {
        await getFirebaseAuthClient();
        const performance = getFirebasePerformanceSync();
        if (!performance)
            return;
        const { trace } = await import('@firebase/performance');
        const duration = Math.max(Math.round(durationMs), 1);
        trace(performance, name).record(Date.now() - duration, duration, { attributes, metrics });
    }
    catch (error) {
        void reportError(undefined, {
            error,
            classOrMethodName: 'recordFirebaseTrace',
            isClient: true,
        });
    }
}
export default function AutoFirebasePerformanceEvents() {
    useReportWebVitals((metric) => {
        const value = Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value);
        void recordFirebaseTrace(`web_${metric.name.toLowerCase()}`, value, { rating: metric.rating });
    });
    return null;
}
