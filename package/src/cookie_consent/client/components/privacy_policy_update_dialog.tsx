'use client';

import useCookieConsent from '../use_cookie_consent';
import DefaultPrivacyPolicyLink from './default_privacy_policy_link';
import DialogPortal from './dialog_portal';
import { getLocaleCache } from '../../../general/cache_variables';
import { defaultPrivacyPolicyUpdateText } from './default_dialog_text';
import { defaultCookieDialogClassNames } from './default_dialog_styles';
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
    message,
    link,
    privacyPolicyLinkText,
    closeText,
    id = 'privacy-policy-update-dialog',
    classNames,
    styles,
    render,
}: PrivacyPolicyUpdateDialogProps): React.ReactElement | null {
    const { privacyPolicyUpdated, acknowledgePrivacyPolicyUpdate, privacyPolicyPath } = useCookieConsent();

    if (!privacyPolicyUpdated) return null;

    if (render) return <>{render({ acknowledge: acknowledgePrivacyPolicyUpdate })}</>;

    const text = defaultPrivacyPolicyUpdateText[getLocaleCache() ?? 'en'] ?? defaultPrivacyPolicyUpdateText.en;
    const resolvedMessage = message ?? text.message;
    const resolvedPrivacyPolicyLinkText = privacyPolicyLinkText ?? text.privacyPolicyLinkText;
    const resolvedCloseText = closeText ?? text.closeText;
    const resolvedClassNames = { ...defaultCookieDialogClassNames, ...classNames };

    const resolvedLink = link !== undefined
        ? link
        : <DefaultPrivacyPolicyLink privacyPolicyPath={privacyPolicyPath} text={resolvedPrivacyPolicyLinkText} className={resolvedClassNames.link} />;

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
                <button
                    type="button"
                    onClick={acknowledgePrivacyPolicyUpdate}
                    aria-label={resolvedCloseText}
                    className={resolvedClassNames.closeButton}
                    style={styles?.closeButton}>
                    {resolvedCloseText}
                </button>
            </div>
        </DialogPortal>
    );
}
