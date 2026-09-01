import { isDarkCookieKey, localeCookieName } from "../../config/cookie_key.js";
import config from "../../config/intl_config.js";
import ClientHelperScript from "../../client/components/client_helper_script.js";
import { defaultStaleDeployPatterns } from "../../error_handling/is_stale_deploy_error.js";

const isDev = process.env.NODE_ENV === 'development';

const appCheck = config.firebaseAuth?.appCheck;
const shouldLoadExplicitRecaptchaScript =
    !!appCheck?.recaptchaV3SiteKey && appCheck.useExplicitRecaptchaScript !== false;

const secureCookieAttribute = isDev ? '+ " Secure;"' : '';

/**
 * Server component exported as `IntlHelperScript` from
 * `cloudflare-next-intl/IntlHelperScript`. Renders inline bootstrap
 * `<script>` tags that run before hydration to avoid FOUC/flicker:
 * - syncs dark-mode class from the theme cookie (or `prefers-color-scheme`)
 * - redirects to the locale-prefixed URL if the locale cookie disagrees
 *   with the current path (covers client-side navigation edge cases)
 * - (prod only) checks `BUILD_ID` and force-reloads on stale deploys
 * - (prod only) listens for `error`/`unhandledrejection` events matching
 *   `isStaleDeployError`'s patterns and force-reloads once per build id —
 *   catches a stale-chunk failure even when the failing chunk is your own
 *   error boundary, before React (and `useStaleDeployRecovery`) ever mounts
 * - loads `recaptcha/api.js?render=explicit` when `firebaseAuth.appCheck`
 *   has a `recaptchaV3SiteKey` and `useExplicitRecaptchaScript` isn't
 *   `false`, so `window.grecaptcha` is ready before App Check's
 *   `CustomProvider` needs it (see `firebase_client.ts`)
 *
 * Place it once in your root layout's `<head>`, alongside `IntlProvider`.
 * No props.
 *
 * @example
 * ```tsx
 * <head>
 *   <IntlHelperScript />
 * </head>
 * ```
 */
export default function HelperScript(): Component | null {

    return <>
        {shouldLoadExplicitRecaptchaScript &&
            <script
                src="https://www.google.com/recaptcha/api.js?render=explicit"
                async
                defer
            />}
        {!isDev &&
            <script
                id="stale-deploy-early-catch"
                dangerouslySetInnerHTML={{
                    __html: `(function() {
                var patterns = ${JSON.stringify(defaultStaleDeployPatterns)};
                var key = 'stale-deploy-recovery-reloaded';
                var attemptedThisLoad = false;
                function isStale(msg) {
                    if (msg === undefined || msg === null) return true;
                    msg = String(msg).toLowerCase();
                    for (var i = 0; i < patterns.length; i++) {
                        if (msg.indexOf(patterns[i]) > -1) return true;
                    }
                    return false;
                }
                function recover(msg, source) {
                    if (attemptedThisLoad) return;
                    try {
                        var stale = isStale(msg);
                        console.warn('[StaleDeploy early-catch] Intercepted:', { source: source, msg: msg, isStale: stale });
                        if (!stale) return;
                        var buildId = localStorage.getItem('buildId') || 'unknown';
                        var marker = sessionStorage.getItem(key);
                        if (marker === buildId) {
                            console.warn('[StaleDeploy early-catch] Skipping reload, already attempted for buildId:', buildId);
                            return;
                        }
                        attemptedThisLoad = true;
                        sessionStorage.setItem(key, buildId);
                        console.warn('[StaleDeploy early-catch] Reloading for buildId:', buildId);
                        try {
                            var u = new URL(window.location.href);
                            u.searchParams.set('_stale_reload', String(Date.now()));
                            window.location.replace(u.toString());
                        } catch (e) {
                            window.location.reload();
                        }
                    } catch (e) {
                        console.error('Stale Deploy Early Catch Script Error:', e);
                    }
                }
                window.addEventListener('error', function(e) { recover(e.message, 'error-event'); });
                window.addEventListener('unhandledrejection', function(e) {
                    recover(e.reason && (e.reason.message || e.reason), 'unhandledrejection');
                });
      })();`
                }} />}
        {!isDev &&
            <script
                id="build-id-script">
                {`(async function() {
                try {
                    const resp = await fetch('/BUILD_ID', { method: 'HEAD', cache: 'no-store' });
                    if (resp.ok) {
                        const BUILD_ID = resp.headers.get('ETag')?.replace(/W\\/|"/g, '');
                        if(!BUILD_ID) return;
                        console.log('Build ID:', BUILD_ID);

                        const prevBuild = localStorage.getItem('buildId');

                        if (prevBuild !== BUILD_ID) {
                            localStorage.setItem('buildId', BUILD_ID);
                            localStorage.setItem('buildIdSetAt', String(Date.now()));
                            if(prevBuild){
                                window.location.reload(true);
                            }
                        }
                    }
                } catch (e) {
                    console.error('Check Build ID Script Error:', e);
                }
      })();`}
            </script>}

        <script
            id="intl-app-state-checker"
        >
            {`(function() {
                try {
                    /**
                     * Efficiently retrieves a cookie value by its name.
                     * @param {string} name - The name of the cookie to retrieve.
                     * @returns {string|null} - The decoded cookie value or null if not found.
                     */
                    const getCookie = (name) => {
                        // Use a regex to find the cookie directly, avoiding splits and loops.
                        // The non-capturing group (?:^|; ) matches the start of the string or a '; '
                        // to ensure we're not matching a substring of another cookie's name.
                        const match = document.cookie.match(new RegExp(\`(?:^|; )\${name}=([^;]*)\`));
                        return match ? decodeURIComponent(match[1]) : null;
                    };

                    function setTheme(isDark){
                        const classList=document.documentElement.classList;
                        // This check is efficient as it only touches the DOM when a change is needed.
                        if (classList.contains('dark') !== isDark) {
                            classList.toggle('dark', isDark);
                        }
                    }
                    
                    function syncTheme(){
                        const isDark = getCookie('${isDarkCookieKey}');

                        setTheme(isDark === 'true')
                    }

                    // 1. Get cookie values directly and efficiently.
                    const locale = getCookie('${localeCookieName}');

                    // 3. Handle Locale Redirect.
                    // The logic is clearer: redirect only if a non-default locale is set
                    // and the URL isn't already localized.
                    // Clean up stale reload query parameter if present
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
                        // Redirecting will stop further script execution on this page.
                        window.location.href = newPath;
                    } else {
                        const isDark = getCookie('${isDarkCookieKey}');
                        if(isDark===null){
                            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                            setTheme(prefersDark);
                            document.cookie = '${isDarkCookieKey}=' +
                                                prefersDark +
                                                '; path=/; max-age=31536000; SameSite=Lax;'
                                                ${secureCookieAttribute};
                        }else{
                            setTheme(isDark==='true');
                        }
                        // 3. Set up listeners for client-side navigation (only if not redirecting).
                        
                        // Store original history methods.
                        const pushState = history.pushState;
                        const replaceState = history.replaceState;
                        const back = history.back;

                        history.back = function (...args) {
                            back.apply(history, args);
                        };
                        history.pushState = function (...args) {
                            pushState.apply(history, args);
                            syncTheme(); // Re-sync theme after navigation.
                        };
                        history.replaceState = function (...args) {
                            replaceState.apply(history, args);
                            syncTheme(); // Re-sync theme after state replacement.
                        };
                    }
                } catch (e) {
                    console.error('App State check Script Error:', e);
                }
      })();`}
        </script>
        <ClientHelperScript />
    </>;
}