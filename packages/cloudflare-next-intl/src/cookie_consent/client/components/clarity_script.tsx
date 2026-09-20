'use client';

import { useEffect } from 'react';
import reportError from '../../../error_handling/report_error.js';
import type * as ClarityModule from '@microsoft/clarity';

let cachedClarityModule: Promise<typeof ClarityModule> | undefined;

function getClarityModule(): Promise<typeof ClarityModule> {
    if (!cachedClarityModule) {
        cachedClarityModule = import('@microsoft/clarity');
    }
    return cachedClarityModule;
}

/**
 * Loads and initializes Microsoft Clarity. Split into its own module and
 * loaded via `next/dynamic` from `cookie_consent_analytics.tsx` so it's
 * only fetched as a separate chunk once actually rendered (consent granted
 * and `analytics.clarityProjectId` set) — `@microsoft/clarity` is a real
 * dependency of this package, so it's always installed regardless.
 */
export default function ClarityScript({ projectId }: { projectId: string }): null {
    useEffect(() => {
        let handle: number | undefined;
        let timeout: ReturnType<typeof setTimeout> | undefined;
        const init = () => {
            getClarityModule()
                .then(({ default: Clarity }) => {
                    Clarity.init(projectId);
                    Clarity.consent();
                })
                .catch((error) => void reportError(undefined, {
                    error,
                    classOrMethodName: 'ClarityScript',
                    isClient: true,
                }));
        };
        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
            handle = window.requestIdleCallback(init, { timeout: 3000 });
        } else {
            timeout = setTimeout(init, 1500);
        }
        return () => {
            if (handle !== undefined && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
                window.cancelIdleCallback(handle);
            }
            if (timeout !== undefined) {
                clearTimeout(timeout);
            }
        };
    }, [projectId]);
    return null;
}
