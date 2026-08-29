'use client';
import { Fragment as _Fragment, jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import useCookieConsent from '../use_cookie_consent';
import DefaultPrivacyPolicyLink from './default_privacy_policy_link';
import DialogPortal from './dialog_portal';
import { getLocaleCache } from '../../../general/cache_variables';
import { defaultCookieConsentText } from './default_dialog_text';
import { defaultCookieDialogClassNames } from './default_dialog_styles';
/**
 * Cookie-consent banner. Renders `null` once `consent` is already decided.
 * Every visual aspect is overridable via `classNames`/`styles` (per-slot) or
 * `render` (full custom markup) — none of it is hardcoded to Tailwind or any
 * particular design system.
 */
export default function CookieConsentDialog({ message, link, privacyPolicyLinkText, showPrivacyPolicy, acceptText, declineText, hideDecline = false, id = 'cookie-consent-dialog', classNames, styles, render, }) {
    const { consent, requiresConsent, isMounted, setConsent, privacyPolicyPath, showPrivacyPolicy: showPrivacyPolicyCtx } = useCookieConsent();
    if (!isMounted || !requiresConsent || consent !== null)
        return null;
    if (render)
        return _jsx(_Fragment, { children: render({ setConsent }) });
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
            ? _jsx(DefaultPrivacyPolicyLink, { privacyPolicyPath: privacyPolicyPath, text: resolvedPrivacyPolicyLinkText, className: resolvedClassNames.link })
            : null;
    return (_jsx(DialogPortal, { children: _jsxs("div", { id: id, role: "dialog", "aria-modal": "false", "aria-labelledby": `${id}-title`, className: resolvedClassNames.root, style: styles?.root, children: [_jsxs("p", { id: `${id}-title`, className: resolvedClassNames.message, style: styles?.message, children: [resolvedMessage, resolvedLink ? _jsxs("span", { children: [" ", resolvedLink] }) : null] }), _jsxs("div", { className: resolvedClassNames.actions, style: styles?.actions, children: [!hideDecline && (_jsx("button", { type: "button", onClick: () => setConsent(false), className: resolvedClassNames.declineButton, style: styles?.declineButton, children: resolvedDeclineText })), _jsx("button", { type: "button", onClick: () => setConsent(true), className: resolvedClassNames.acceptButton, style: styles?.acceptButton, children: resolvedAcceptText })] })] }) }));
}
