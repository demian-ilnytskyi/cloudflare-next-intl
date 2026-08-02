import type { CookieDialogClassNames, CookieDialogStyles } from '../../types';
export interface PrivacyPolicyUpdateDialogProps {
    message?: React.ReactNode;
    /** Optional link element rendered right after `message` (e.g. to your privacy-policy page). */
    link?: React.ReactNode;
    closeText?: string;
    id?: string;
    classNames?: CookieDialogClassNames;
    styles?: CookieDialogStyles;
    /**
     * Full custom render — receives the acknowledge action and bypasses the
     * default markup entirely.
     */
    render?: (props: {
        acknowledge: () => void;
    }) => React.ReactNode;
}
/**
 * "Privacy policy updated" banner. Auto-enabled only when
 * `cookieConsent.privacyPolicyDate` is set on the `RoutingConfig` — renders
 * `null` otherwise, or once acknowledged. Every visual aspect is overridable
 * via `classNames`/`styles` (per-slot) or `render` (full custom markup).
 */
export default function PrivacyPolicyUpdateDialog({ message, link, closeText, id, classNames, styles, render, }: PrivacyPolicyUpdateDialogProps): React.ReactElement | null;
