/**
 * Renders the default privacy-policy link used by `CookieConsentDialog`/
 * `PrivacyPolicyUpdateDialog` when their `link` prop is omitted. Returns
 * `null` when `privacyPolicyPath` is `false` (disabled via
 * `cookieConsent.privacyPolicyPath`). Locale-prefixes `privacyPolicyPath`
 * the same way the server `Link` component does — reads the locale set by
 * `LocationzationClientProvider` on the current render.
 */
export default function DefaultPrivacyPolicyLink({ privacyPolicyPath, text, className, style }: {
    privacyPolicyPath: string | false;
    text: string;
    className?: string;
    style?: React.CSSProperties;
}): React.ReactElement | null;
