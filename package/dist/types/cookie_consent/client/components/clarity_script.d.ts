/**
 * Loads and initializes Microsoft Clarity. Split into its own module and
 * loaded via `next/dynamic` from `cookie_consent_analytics.tsx` so it's
 * only fetched as a separate chunk once actually rendered (consent granted
 * and `analytics.clarityProjectId` set) — `@microsoft/clarity` is a real
 * dependency of this package, so it's always installed regardless.
 */
export default function ClarityScript({ projectId }: {
    projectId: string;
}): null;
