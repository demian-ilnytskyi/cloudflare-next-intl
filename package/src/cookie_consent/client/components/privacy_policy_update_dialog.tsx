'use client';

import useCookieConsent from '../use_cookie_consent';
import DefaultPrivacyPolicyLink from './default_privacy_policy_link';
import type { CookieDialogClassNames, CookieDialogStyles } from '../../types';

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
    closeText?: string;
    id?: string;
    classNames?: CookieDialogClassNames;
    styles?: CookieDialogStyles;
    /**
     * Full custom render — receives the acknowledge action and bypasses the
     * default markup entirely.
     */
    render?: (props: { acknowledge: () => void }) => React.ReactNode;
}

/**
 * "Privacy policy updated" banner. Auto-enabled only when
 * `cookieConsent.privacyPolicyDate` is set on the `RoutingConfig` — renders
 * `null` otherwise, or once acknowledged. Every visual aspect is overridable
 * via `classNames`/`styles` (per-slot) or `render` (full custom markup).
 */
export default function PrivacyPolicyUpdateDialog({
    message = 'Our privacy policy has been updated.',
    link,
    privacyPolicyLinkText = 'Learn more',
    closeText = 'Got it',
    id = 'privacy-policy-update-dialog',
    classNames,
    styles,
    render,
}: PrivacyPolicyUpdateDialogProps): React.ReactElement | null {
    const { privacyPolicyUpdated, acknowledgePrivacyPolicyUpdate, privacyPolicyPath } = useCookieConsent();

    if (!privacyPolicyUpdated) return null;

    if (render) return <>{render({ acknowledge: acknowledgePrivacyPolicyUpdate })}</>;

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
            <button
                type="button"
                onClick={acknowledgePrivacyPolicyUpdate}
                aria-label={closeText}
                className={classNames?.closeButton}
                style={styles?.closeButton}>
                {closeText}
            </button>
        </div>
    );
}
