'use client';
import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import useCookieConsent from '../use_cookie_consent';
import DefaultPrivacyPolicyLink from './default_privacy_policy_link';
/**
 * "Privacy policy updated" banner. Auto-enabled only when
 * `cookieConsent.privacyPolicyDate` is set on the `RoutingConfig` — renders
 * `null` otherwise, or once acknowledged. Every visual aspect is overridable
 * via `classNames`/`styles` (per-slot) or `render` (full custom markup).
 */
export default function PrivacyPolicyUpdateDialog({ message = 'Our privacy policy has been updated.', link, privacyPolicyLinkText = 'Learn more', closeText = 'Got it', id = 'privacy-policy-update-dialog', classNames, styles, render, }) {
    const { privacyPolicyUpdated, acknowledgePrivacyPolicyUpdate, privacyPolicyPath } = useCookieConsent();
    if (!privacyPolicyUpdated)
        return null;
    if (render)
        return _jsx(_Fragment, { children: render({ acknowledge: acknowledgePrivacyPolicyUpdate }) });
    const resolvedLink = link !== undefined
        ? link
        : _jsx(DefaultPrivacyPolicyLink, { privacyPolicyPath: privacyPolicyPath, text: privacyPolicyLinkText });
    return (_jsxs("div", { id: id, role: "dialog", "aria-modal": "false", "aria-labelledby": `${id}-title`, className: classNames?.root, style: styles?.root, children: [_jsxs("p", { id: `${id}-title`, className: classNames?.message, style: styles?.message, children: [message, resolvedLink ? _jsxs("span", { className: classNames?.link, style: styles?.link, children: [" ", resolvedLink] }) : null] }), _jsx("button", { type: "button", onClick: acknowledgePrivacyPolicyUpdate, "aria-label": closeText, className: classNames?.closeButton, style: styles?.closeButton, children: closeText })] }));
}
