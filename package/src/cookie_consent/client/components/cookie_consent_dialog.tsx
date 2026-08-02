'use client';

import useCookieConsent from '../use_cookie_consent';
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
    acceptText = 'Accept',
    declineText = 'Necessary only',
    hideDecline = false,
    id = 'cookie-consent-dialog',
    classNames,
    styles,
    render,
}: CookieConsentDialogProps): React.ReactElement | null {
    const { consent, setConsent } = useCookieConsent();

    if (consent !== null) return null;

    if (render) return <>{render({ setConsent })}</>;

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
