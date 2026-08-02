'use client';

import useCookieConsent from '../use_cookie_consent';
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
    closeText = 'Got it',
    id = 'privacy-policy-update-dialog',
    classNames,
    styles,
    render,
}: PrivacyPolicyUpdateDialogProps): React.ReactElement | null {
    const { privacyPolicyUpdated, acknowledgePrivacyPolicyUpdate } = useCookieConsent();

    if (!privacyPolicyUpdated) return null;

    if (render) return <>{render({ acknowledge: acknowledgePrivacyPolicyUpdate })}</>;

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
                {link ? <span className={classNames?.link} style={styles?.link}> {link}</span> : null}
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
