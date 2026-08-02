'use client';

import useCookieConsent from '../use_cookie_consent';
import DefaultPrivacyPolicyLink from './default_privacy_policy_link';
import type { CookieDialogClassNames, CookieDialogStyles } from '../../types';

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
    render?: (props: { setConsent: (value: boolean) => void }) => React.ReactNode;
}

/**
 * Cookie-consent banner. Renders `null` once `consent` is already decided.
 * Every visual aspect is overridable via `classNames`/`styles` (per-slot) or
 * `render` (full custom markup) — none of it is hardcoded to Tailwind or any
 * particular design system.
 */
export default function CookieConsentDialog({
    message = 'We use cookies to improve your experience.',
    link,
    privacyPolicyLinkText = 'Privacy Policy',
    acceptText = 'Accept',
    declineText = 'Necessary only',
    hideDecline = false,
    id = 'cookie-consent-dialog',
    classNames,
    styles,
    render,
}: CookieConsentDialogProps): React.ReactElement | null {
    const { consent, setConsent, privacyPolicyPath } = useCookieConsent();

    if (consent !== null) return null;

    if (render) return <>{render({ setConsent })}</>;

    const resolvedLink = link !== undefined
        ? link
        : <DefaultPrivacyPolicyLink privacyPolicyPath={privacyPolicyPath} text={privacyPolicyLinkText} />;

    return (
        <div
            id={id}
            role="dialog"
            aria-modal="false"
            aria-labelledby={`${id}-title`}
            className={classNames?.root}
            style={styles?.root}>
            <p id={`${id}-title`} className={classNames?.message} style={styles?.message}>
                {message}
                {resolvedLink ? <span className={classNames?.link} style={styles?.link}> {resolvedLink}</span> : null}
            </p>
            <div className={classNames?.actions} style={styles?.actions}>
                {!hideDecline && (
                    <button
                        type="button"
                        onClick={() => setConsent(false)}
                        className={classNames?.declineButton}
                        style={styles?.declineButton}>
                        {declineText}
                    </button>
                )}
                <button
                    type="button"
                    onClick={() => setConsent(true)}
                    className={classNames?.acceptButton}
                    style={styles?.acceptButton}>
                    {acceptText}
                </button>
            </div>
        </div>
    );
}
