'use client';

import useCookieConsent from '../use_cookie_consent.js';
import DefaultPrivacyPolicyLink from './default_privacy_policy_link.js';
import DialogPortal from './dialog_portal.js';
import { getLocaleCache } from '../../../general/cache_variables.js';
import { defaultCookieConsentText } from './default_dialog_text.js';
import { defaultCookieDialogClassNames } from './default_dialog_styles.js';
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
    render?: (props: { setConsent: (value: ConsentValue) => void }) => React.ReactNode;
}

/**
 * Cookie-consent banner. Renders `null` once `consent` is already decided.
 * Every visual aspect is overridable via `classNames`/`styles` (per-slot) or
 * `render` (full custom markup) — none of it is hardcoded to Tailwind or any
 * particular design system.
 */
export default function CookieConsentDialog({
    message,
    link,
    privacyPolicyLinkText,
    showPrivacyPolicy,
    acceptText,
    declineText,
    hideDecline = false,
    id = 'cookie-consent-dialog',
    classNames,
    styles,
    render,
}: CookieConsentDialogProps): React.ReactElement | null {
    const { consent, requiresConsent, isMounted, setConsent, privacyPolicyPath, showPrivacyPolicy: showPrivacyPolicyCtx } = useCookieConsent();

    if (!isMounted || !requiresConsent || consent !== null) return null;

    if (render) return <>{render({ setConsent })}</>;

    const text = defaultCookieConsentText[getLocaleCache() ?? 'en'] ?? defaultCookieConsentText.en;
    const resolvedMessage = message ?? text.message;
    const resolvedPrivacyPolicyLinkText = privacyPolicyLinkText ?? text.privacyPolicyLinkText;
    const resolvedAcceptText = acceptText ?? text.acceptText;
    const resolvedDeclineText = declineText ?? text.declineText;
    const resolvedClassNames = { ...defaultCookieDialogClassNames, ...classNames };
    const shouldShowPolicy = showPrivacyPolicy ?? showPrivacyPolicyCtx;

    const resolvedLink = link !== undefined
        ? link
        : (shouldShowPolicy && privacyPolicyPath !== false)
            ? <DefaultPrivacyPolicyLink privacyPolicyPath={privacyPolicyPath} text={resolvedPrivacyPolicyLinkText} className={resolvedClassNames.link} />
            : null;

    return (
        <DialogPortal>
            <div
                id={id}
                role="dialog"
                aria-modal="false"
                aria-labelledby={`${id}-title`}
                className={resolvedClassNames.root}
                style={styles?.root}>
                <p id={`${id}-title`} className={resolvedClassNames.message} style={styles?.message}>
                    {resolvedMessage}
                    {resolvedLink ? <span> {resolvedLink}</span> : null}
                </p>
                <div className={resolvedClassNames.actions} style={styles?.actions}>
                    {!hideDecline && (
                        <button
                            type="button"
                            onClick={() => setConsent(false)}
                            className={resolvedClassNames.declineButton}
                            style={styles?.declineButton}>
                            {resolvedDeclineText}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => setConsent(true)}
                        className={resolvedClassNames.acceptButton}
                        style={styles?.acceptButton}>
                        {resolvedAcceptText}
                    </button>
                </div>
            </div>
        </DialogPortal>
    );
}
