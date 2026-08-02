'use client';
import { useEffect } from 'react';
let cachedClarityModule;
function getClarityModule() {
    if (!cachedClarityModule) {
        cachedClarityModule = import('@microsoft/clarity');
    }
    return cachedClarityModule;
}
/**
 * Loads and initializes Microsoft Clarity. Split into its own module and
 * loaded via `next/dynamic` from `cookie_consent_analytics.tsx` — bundlers
 * (webpack/Turbopack) resolve every literal `import()` specifier they can
 * reach at build time, so keeping this file's `import('@microsoft/clarity')`
 * out of the main analytics module means consumers who never set
 * `secrets.clarityProjectId` (and never render this component) don't need
 * `@microsoft/clarity` (an optional peer dependency) installed at all — the
 * dynamic-imported chunk containing this file is only built/requested the
 * first time it's actually rendered.
 */
export default function ClarityScript({ projectId }) {
    useEffect(() => {
        getClarityModule()
            .then(({ default: Clarity }) => {
            Clarity.init(projectId);
            Clarity.consent();
        })
            .catch((error) => console.error(`cloudflare-next-intl: failed to load @microsoft/clarity: ${error}`));
    }, [projectId]);
    return null;
}
