import type { CookieDialogClassNames, CookieDialogStyles } from '../../types.js';
export interface PrivacyPolicyUpdateDialogProps {
    message?: React.ReactNode;
    /**
     * Link element rendered right after `message`. Defaults to a link to
     * `cookieConsent.privacyPolicyPath` (`'/privacy-policy'` unless
     * configured otherwise) with `privacyPolicyLinkText` as its label. Pass
     * `null` to render no link, or your own element to override it.
     */
    link?: React.ReactNode;
    /** Label for the default privacy-policy link. Ignored when `link` is set. */
    privacyPolicyLinkText?: string;
    /**
     * Whether to show the privacy policy link. Defaults to `cookieConsent.showPrivacyPolicy`
     * (or `true` if unconfigured). Pass `false` to hide it, or `true` to force show.
     */
    showPrivacyPolicy?: boolean;
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
export default function PrivacyPolicyUpdateDialog({ message, link, privacyPolicyLinkText, showPrivacyPolicy, closeText, id, classNames, styles, render, }: PrivacyPolicyUpdateDialogProps): React.ReactElement | null;
