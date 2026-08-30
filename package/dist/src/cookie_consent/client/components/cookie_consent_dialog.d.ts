import type { ConsentValue, CookieDialogClassNames, CookieDialogStyles } from '../../types.js';
export interface CookieConsentDialogProps {
    /** Banner message text. */
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
        setConsent: (value: ConsentValue) => void;
    }) => React.ReactNode;
}
/**
 * Cookie-consent banner. Renders `null` once `consent` is already decided.
 * Every visual aspect is overridable via `classNames`/`styles` (per-slot) or
 * `render` (full custom markup) — none of it is hardcoded to Tailwind or any
 * particular design system.
 */
export default function CookieConsentDialog({ message, link, privacyPolicyLinkText, showPrivacyPolicy, acceptText, declineText, hideDecline, id, classNames, styles, render, }: CookieConsentDialogProps): React.ReactElement | null;
