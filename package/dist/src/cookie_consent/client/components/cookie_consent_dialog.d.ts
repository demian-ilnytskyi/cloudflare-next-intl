import type { CookieDialogClassNames, CookieDialogStyles } from '../../types';
export interface CookieConsentDialogProps {
    /** Banner message text. */
    message?: React.ReactNode;
    /** Optional link element rendered right after `message` (e.g. a privacy-policy link). */
    link?: React.ReactNode;
    acceptText?: string;
    declineText?: string;
    /** Hides the decline ("necessary only") button, leaving only accept. */
    hideDecline?: boolean;
    id?: string;
    classNames?: CookieDialogClassNames;
    styles?: CookieDialogStyles;
    /**
     * Full custom render — receives the resolved consent state/actions and
     * bypasses the default markup entirely. Use for a fully bespoke dialog.
     */
    render?: (props: {
        setConsent: (value: boolean) => void;
    }) => React.ReactNode;
}
/**
 * Cookie-consent banner. Renders `null` once `consent` is already decided.
 * Every visual aspect is overridable via `classNames`/`styles` (per-slot) or
 * `render` (full custom markup) — none of it is hardcoded to Tailwind or any
 * particular design system.
 */
export default function CookieConsentDialog({ message, link, acceptText, declineText, hideDecline, id, classNames, styles, render, }: CookieConsentDialogProps): React.ReactElement | null;
