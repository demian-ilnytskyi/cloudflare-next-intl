'use client';
import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import useCookieConsent from '../use_cookie_consent.js';
import DefaultPrivacyPolicyLink from './default_privacy_policy_link.js';
import DialogPortal from './dialog_portal.js';
import { getLocaleCache } from '../../../general/cache_variables.js';
import { defaultPrivacyPolicyUpdateText } from './default_dialog_text.js';
import { defaultCookieDialogClassNames } from './default_dialog_styles.js';
export default function PrivacyPolicyUpdateDialog({ message, link, privacyPolicyLinkText, showPrivacyPolicy, closeText, id = 'privacy-policy-update-dialog', classNames, styles, render, }) {
    const { privacyPolicyUpdated, acknowledgePrivacyPolicyUpdate, privacyPolicyPath, showPrivacyPolicy: showPrivacyPolicyCtx } = useCookieConsent();
    if (!privacyPolicyUpdated)
        return null;
    if (render)
        return _jsx(_Fragment, { children: render({ acknowledge: acknowledgePrivacyPolicyUpdate }) });
    const text = defaultPrivacyPolicyUpdateText[getLocaleCache() ?? 'en'] ?? defaultPrivacyPolicyUpdateText.en;
    const resolvedMessage = message ?? text.message;
    const resolvedPrivacyPolicyLinkText = privacyPolicyLinkText ?? text.privacyPolicyLinkText;
    const resolvedCloseText = closeText ?? text.closeText;
    const resolvedClassNames = { ...defaultCookieDialogClassNames, ...classNames };
    const shouldShowPolicy = showPrivacyPolicy ?? showPrivacyPolicyCtx;
    const resolvedLink = link !== undefined
        ? link
        : (shouldShowPolicy && privacyPolicyPath !== false)
            ? _jsx(DefaultPrivacyPolicyLink, { privacyPolicyPath: privacyPolicyPath, text: resolvedPrivacyPolicyLinkText, className: resolvedClassNames.link })
            : null;
    return (_jsx(DialogPortal, { children: _jsxs("div", { id: id, role: "dialog", "aria-modal": "false", "aria-labelledby": `${id}-title`, className: resolvedClassNames.root, style: styles?.root, children: [_jsxs("p", { id: `${id}-title`, className: resolvedClassNames.message, style: styles?.message, children: [resolvedMessage, resolvedLink ? _jsxs("span", { children: [" ", resolvedLink] }) : null] }), _jsx("button", { type: "button", onClick: acknowledgePrivacyPolicyUpdate, "aria-label": resolvedCloseText, className: resolvedClassNames.closeButton, style: styles?.closeButton, children: resolvedCloseText })] }) }));
}
