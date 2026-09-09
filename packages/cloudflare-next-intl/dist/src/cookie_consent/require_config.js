export default function requireCookieConsentConfig(value) {
    if (!value) {
        throw new Error('cloudflare-next-intl: `cookieConsent` is not set on your `RoutingConfig`. ' +
            'Add a `cookieConsent` block (see `CookieConsentRoutingConfig`) to the config ' +
            'object passed to `setIntlConfig` before using `CookieConsentProvider`/`useCookieConsent`.');
    }
    return value;
}
