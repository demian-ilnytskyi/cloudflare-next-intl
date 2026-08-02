'use client';
import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import useCookieConsent from '../use_cookie_consent';
import DefaultPrivacyPolicyLink from './default_privacy_policy_link';
import DialogPortal from './dialog_portal';
import { getLocaleCache } from '../../../general/cache_variables';
import { defaultPrivacyPolicyUpdateText } from './default_dialog_text';
import { defaultCookieDialogClassNames } from './default_dialog_styles';
/**
 * "Privacy policy updated" banner. Auto-enabled only when
 * `cookieConsent.privacyPolicyDate` is set on the `RoutingConfig` — renders
 * `null` otherwise, or once acknowledged. Every visual aspect is overridable
 * via `classNames`/`styles` (per-slot) or `render` (full custom markup).
 */
export default function PrivacyPolicyUpdateDialog({ message, link, privacyPolicyLinkText, closeText, id = 'privacy-policy-update-dialog', classNames, styles, render, }) {
    const { privacyPolicyUpdated, acknowledgePrivacyPolicyUpdate, privacyPolicyPath } = useCookieConsent();
    if (!privacyPolicyUpdated)
        return null;
    if (render)
        return _jsx(_Fragment, { children: render({ acknowledge: acknowledgePrivacyPolicyUpdate }) });
    const text = defaultPrivacyPolicyUpdateText[getLocaleCache() ?? 'en'] ?? defaultPrivacyPolicyUpdateText.en;
    const resolvedMessage = message ?? text.message;
    const resolvedPrivacyPolicyLinkText = privacyPolicyLinkText ?? text.privacyPolicyLinkText;
    const resolvedCloseText = closeText ?? text.closeText;
    const resolvedClassNames = { ...defaultCookieDialogClassNames, ...classNames };
    const resolvedLink = link !== undefined
        ? link
        : _jsx(DefaultPrivacyPolicyLink, { privacyPolicyPath: privacyPolicyPath, text: resolvedPrivacyPolicyLinkText, className: resolvedClassNames.link });
    return (_jsx(DialogPortal, { children: _jsxs("div", { id: id, role: "dialog", "aria-modal": "false", "aria-labelledby": `${id}-title`, className: resolvedClassNames.root, style: styles?.root, children: [_jsxs("p", { id: `${id}-title`, className: resolvedClassNames.message, style: styles?.message, children: [resolvedMessage, resolvedLink ? _jsxs("span", { children: [" ", resolvedLink] }) : null] }), _jsx("button", { type: "button", onClick: acknowledgePrivacyPolicyUpdate, "aria-label": resolvedCloseText, className: resolvedClassNames.closeButton, style: styles?.closeButton, children: resolvedCloseText })] }) }));
}
