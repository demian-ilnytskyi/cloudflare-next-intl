'use client';

import { useEffect } from 'react';
import reportError from '../../../error_handling/report_error';

let cachedClarityModule: Promise<typeof import('@microsoft/clarity')> | undefined;

function getClarityModule(): Promise<typeof import('@microsoft/clarity')> {
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
    }, [projectId]);
    return null;
}
