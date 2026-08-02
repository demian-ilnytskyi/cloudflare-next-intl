'use client';
import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import useCookieConsent from '../use_cookie_consent';
import DefaultPrivacyPolicyLink from './default_privacy_policy_link';
/**
 * Cookie-consent banner. Renders `null` once `consent` is already decided.
 * Every visual aspect is overridable via `classNames`/`styles` (per-slot) or
 * `render` (full custom markup) — none of it is hardcoded to Tailwind or any
 * particular design system.
 */
export default function CookieConsentDialog({ message = 'We use cookies to improve your experience.', link, privacyPolicyLinkText = 'Privacy Policy', acceptText = 'Accept', declineText = 'Necessary only', hideDecline = false, id = 'cookie-consent-dialog', classNames, styles, render, }) {
    const { consent, setConsent, privacyPolicyPath } = useCookieConsent();
    if (consent !== null)
        return null;
    if (render)
        return _jsx(_Fragment, { children: render({ setConsent }) });
    const resolvedLink = link !== undefined
        ? link
        : _jsx(DefaultPrivacyPolicyLink, { privacyPolicyPath: privacyPolicyPath, text: privacyPolicyLinkText });
    return (_jsxs("div", { id: id, role: "dialog", "aria-modal": "false", "aria-labelledby": `${id}-title`, className: classNames?.root, style: styles?.root, children: [_jsxs("p", { id: `${id}-title`, className: classNames?.message, style: styles?.message, children: [message, resolvedLink ? _jsxs("span", { className: classNames?.link, style: styles?.link, children: [" ", resolvedLink] }) : null] }), _jsxs("div", { className: classNames?.actions, style: styles?.actions, children: [!hideDecline && (_jsx("button", { type: "button", onClick: () => setConsent(false), className: classNames?.declineButton, style: styles?.declineButton, children: declineText })), _jsx("button", { type: "button", onClick: () => setConsent(true), className: classNames?.acceptButton, style: styles?.acceptButton, children: acceptText })] })] }));
}
