import { localeCookieName } from "../../config/cookie_key.js";
import config from "../../config/intl_config.js";

/**
 * Server component exported as `IntlHelperScript` from
 * `cloudflare-next-intl-intl/IntlHelperScript`. Renders inline bootstrap
 * `<script>` tags that run before hydration:
 * - redirects to the locale-prefixed URL if the locale cookie disagrees
 *   with the current path (covers client-side navigation edge cases)
 *
 * Also renders `<link rel="dns-prefetch">` hints for provided origins, and —
 * when `locale` is passed — a `<meta httpEquiv="Content-Language">` tag.
 *
 * Any `children` (such as theme or error recovery scripts injected by the
 * umbrella package) are rendered before the locale redirect script.
 *
 * Place it once in your root layout's `<head>`, alongside `IntlProvider`.
 */
export default function HelperScript({
    locale,
    prefetchOrigins,
    preconnectOrigins,
    children,
}: {
    locale?: string;
    prefetchOrigins?: string[];
    preconnectOrigins?: string[];
    children?: React.ReactNode;
}) {
    return (
        <>
            {locale && <meta httpEquiv="Content-Language" content={locale} />}
            {prefetchOrigins?.map((origin) => (
                <link key={origin} rel="dns-prefetch" href={origin} />
            ))}
            {preconnectOrigins?.map((origin) => (
                <link key={origin} rel="preconnect" href={origin} />
            ))}
            {children}
            <script
                id="intl-app-state-checker"
                dangerouslySetInnerHTML={{
                    __html: `(function() {
                try {
                    const getCookie = (name) => {
                        try {
                            const match = document.cookie.match(new RegExp(\`(?:^|; )\${name}=([^;]*)\`));
                            return match ? decodeURIComponent(match[1]) : null;
                        } catch (e) {
                            return null;
                        }
                    };

                    const locale = getCookie('${localeCookieName}');

                    const { pathname, search, hash } = window.location;
                    if (search && search.indexOf('_stale_reload=') > -1) {
                        try {
                            const cleanUrl = new URL(window.location.href);
                            cleanUrl.searchParams.delete('_stale_reload');
                            window.history.replaceState(history.state, '', cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
                        } catch (e) {}
                    }

                    if (locale && locale !== '${config.defaultLocale}' && !pathname.startsWith(\`/\${locale}\`)) {
                        const newPath = \`/\${locale}\${pathname === '/' ? '' : pathname}\${search}\${hash}\`;
                        try {
                            window.location.href = newPath;
                        } catch (e) {}
                    }
                } catch (e) {
                    console.error('App State check Script Error:', e);
                }
            })();`
                }}
            />
        </>
    );
}