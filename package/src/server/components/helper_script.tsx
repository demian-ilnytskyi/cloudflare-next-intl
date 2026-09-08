import { isDarkCookieKey, localeCookieName } from "../../config/cookie_key.js";
import config from "../../config/intl_config.js";
import ClientHelperScript from "../../client/components/client_helper_script.js";
import { defaultStaleDeployPatterns } from "../../error_handling/is_stale_deploy_error.js";

const isDev = process.env.NODE_ENV === 'development';

export const defaultReloadHtml =
    '<div style="position:fixed;inset:0;background:#ffffff;display:flex;align-items:center;justify-content:center;z-index:9999999;"><div style="width:36px;height:36px;border:3px solid #e5e7eb;border-top-color:#17181b;border-radius:50%;animation:cfni-spin 0.8s linear infinite;"></div><style>@keyframes cfni-spin{to{transform:rotate(360deg)}}</style></div>';

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
    /* v8 ignore next -- config-fallback branch tested by unit assertion on defaultReloadHtml export */
    const reloadHtml = config.errorHandling?.staleDeployReloadHtml ?? defaultReloadHtml;

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
                try {
                var patterns = ${JSON.stringify(defaultStaleDeployPatterns)};
                var key = 'stale-deploy-recovery-reloaded';
                var timeKey = 'stale-deploy-recovery-time';
                var countKey = 'stale-deploy-recovery-count';
                var maxAttempts = 3;
                var attemptedThisLoad = false;
                // Set by the resource-error listener: the first same-origin
                // chunk that failed. Reloading is pointless until that URL
                // answers with real JavaScript again, so it doubles as the
                // health probe below.
                var probeUrl = null;
                var maxProbes = 3;
                function isStale(msg) {
                    if (msg === undefined || msg === null) return true;
                    msg = String(msg).toLowerCase();
                    for (var i = 0; i < patterns.length; i++) {
                        if (msg.indexOf(patterns[i]) > -1) return true;
                    }
                    return false;
                }
                // Cover the page, never replace it. Wiping document.body used
                // to be safe because a reload followed immediately; now that a
                // probe can run for a few seconds first, React keeps rendering
                // against the tree and every removeChild/insertBefore throws,
                // which crashes it into the very error UI this is hiding.
                var overlayId = 'cfni-stale-deploy-overlay';
                function showOverlay() {
                    try {
                        var root = document.documentElement;
                        if (!root || document.getElementById(overlayId)) return;
                        var el = document.createElement('div');
                        el.id = overlayId;
                        el.setAttribute('style', 'position:fixed;inset:0;z-index:2147483647;background:#ffffff;');
                        el.innerHTML = ${JSON.stringify(reloadHtml)};
                        (document.body || root).appendChild(el);
                    } catch (e) {}
                }
                function doReload() {
                    try {
                        var u = new URL(window.location.href);
                        u.searchParams.set('_stale_reload', String(Date.now()));
                        window.location.replace(u.toString());
                    } catch (e) {
                        try { window.location.reload(); } catch (e2) {}
                    }
                }
                // A deploy swaps the Worker version colo by colo, so for a few
                // seconds the document can come from the new version while a
                // chunk request still lands on the old one, which answers with
                // a plain-text 404 body instead of JavaScript. Reloading inside
                // that window just reproduces the error, so poll the failed
                // chunk with a cache-busted request until it is real
                // JavaScript, then reload once. Give up after maxProbes and
                // reload anyway rather than hanging on the overlay.
                function probeThenReload(attempt) {
                    if (!probeUrl || typeof fetch !== 'function') return doReload();
                    var url = probeUrl + (probeUrl.indexOf('?') > -1 ? '&' : '?') + '_r=' + Date.now();
                    fetch(url, { cache: 'reload', credentials: 'omit' }).then(function(r) {
                        var ct = (r.headers.get('content-type') || '').toLowerCase();
                        if (!r.ok || ct.indexOf('javascript') === -1) throw new Error('unhealthy: ' + r.status + ' ' + ct);
                        doReload();
                    }).catch(function(err) {
                        if (attempt >= maxProbes) {
                            console.warn('[StaleDeploy early-catch] Asset still unhealthy after', attempt + 1, 'probes - reloading anyway:', String(err));
                            return doReload();
                        }
                        setTimeout(function() { probeThenReload(attempt + 1); }, 300 * Math.pow(2, attempt));
                    });
                }
                function recover(msg, source) {
                    if (attemptedThisLoad) return;
                    try {
                        var stale = isStale(msg);
                        console.warn('[StaleDeploy early-catch] Intercepted:', { source: source, msg: msg, isStale: stale });
                        if (!stale) return;
                        var buildId = localStorage.getItem('buildId') || 'unknown';
                        var marker = sessionStorage.getItem(key);
                        // Attempts are counted per build id: the first few
                        // page loads may each recover, then it falls through to
                        // the error UI. A new deploy resets the count.
                        var sameBuild = marker === buildId;
                        var attempts = 0;
                        if (sameBuild) {
                            var rawCount = sessionStorage.getItem(countKey);
                            attempts = rawCount ? Number(rawCount) : 0;
                            if (!(attempts >= 0)) attempts = 0;
                        }
                        if (sameBuild && attempts >= maxAttempts) {
                            console.warn('[StaleDeploy early-catch] Skipping reload, attempts exhausted for buildId:', buildId, attempts);
                            return;
                        }
                        // No time-based throttle: the probe below already
                        // paces the retry and refuses to reload until the asset
                        // is readable, so a clock-based wait only strands the
                        // visitor on the overlay for the rest of the window.
                        // attemptedThisLoad stops a burst within one load and
                        // maxAttempts stops a reload loop across loads.
                        attemptedThisLoad = true;
                        sessionStorage.setItem(key, buildId);
                        sessionStorage.setItem(countKey, String(attempts + 1));
                        sessionStorage.setItem(timeKey, String(Date.now()));
                        showOverlay();
                        probeThenReload(0);
                    } catch (e) {
                        console.error('Stale Deploy Early Catch Script Error:', e);
                    }
                }
                window.addEventListener('error', function(e) { recover(e.message, 'error-event'); });
                // Resource-load failures (a chunk 404ing or served with a
                // disallowed MIME type) fire a non-bubbling 'error' event on the
                // element itself, so they only reach window during capture, and
                // they carry no message. Treat a failed script/link as stale.
                window.addEventListener('error', function(e) {
                    try {
                        var el = e.target;
                        if (!el || el === window) return;
                        var tag = (el.tagName || '').toLowerCase();
                        if (tag !== 'script' && tag !== 'link') return;
                        var src = el.src || el.href || '';
                        if (!src) return;
                        // Only our own build output can break the React module
                        // graph. A failed third-party script (analytics,
                        // reCAPTCHA) must never trigger a reload.
                        var sameOrigin = false;
                        try { sameOrigin = new URL(src, window.location.href).origin === window.location.origin; } catch (err2) { return; }
                        if (!sameOrigin) return;
                        if (!probeUrl) probeUrl = src;
                        recover('chunk resource failed to load: ' + src, 'resource-error');
                    } catch (err) {}
                }, true);
                window.addEventListener('unhandledrejection', function(e) {
                    recover(e.reason && (e.reason.message || e.reason), 'unhandledrejection');
                });
                } catch (e) { try { console.error('Stale Deploy Early Catch Script Error:', e); } catch (e2) {} }
      })();`
                }} />}
        {!isDev &&
            <script
                id="build-id-script"
                dangerouslySetInnerHTML={{
                    __html: `(async function() {
                try {
                    const resp = await fetch('/BUILD_ID', { method: 'HEAD', cache: 'no-store' });
                    if (resp.ok) {
                        let BUILD_ID;
                        try {
                            BUILD_ID = resp.headers.get('ETag')?.replace(/W\\/|"/g, '');
                        } catch (e) { BUILD_ID = undefined; }
                        if(!BUILD_ID) return;
                        try { console.log('Build ID:', BUILD_ID); } catch (e) {}

                        let prevBuild;
                        try {
                            prevBuild = localStorage.getItem('buildId');
                        } catch (e) { prevBuild = null; }

                        if (prevBuild !== BUILD_ID) {
                            try {
                                localStorage.setItem('buildId', BUILD_ID);
                                localStorage.setItem('buildIdSetAt', String(Date.now()));
                            } catch (e) {}
                            if(prevBuild){
                                try {
                                    window.location.reload(true);
                                } catch (e) {
                                    try { window.location.reload(); } catch (e2) {}
                                }
                            }
                        }
                    }
                } catch (e) {
                    try { console.error('Check Build ID Script Error:', e); } catch (e2) {}
                }
      })();`
                }} />}

        <script
            id="intl-app-state-checker"
            dangerouslySetInnerHTML={{
                __html: `(function() {
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
                        try {
                            const match = document.cookie.match(new RegExp(\`(?:^|; )\${name}=([^;]*)\`));
                            return match ? decodeURIComponent(match[1]) : null;
                        } catch (e) {
                            return null;
                        }
                    };

                    function setTheme(isDark){
                        try {
                            const classList=document.documentElement.classList;
                            // This check is efficient as it only touches the DOM when a change is needed.
                            if (classList.contains('dark') !== isDark) {
                                classList.toggle('dark', isDark);
                            }
                        } catch (e) {}
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
                        try {
                            window.location.href = newPath;
                        } catch (e) {}
                    } else {
                        const isDark = getCookie('${isDarkCookieKey}');
                        if(isDark===null){
                            let prefersDark = false;
                            try {
                                prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                            } catch (e) {}
                            setTheme(prefersDark);
                            try {
                                document.cookie = '${isDarkCookieKey}=' +
                                                    prefersDark +
                                                    '; path=/; max-age=31536000; SameSite=Lax;'
                                                    ${secureCookieAttribute};
                            } catch (e) {}
                        }else{
                            setTheme(isDark==='true');
                        }
                        // 3. Set up listeners for client-side navigation (only if not redirecting).
                        try {
                            // Store original history methods.
                            const pushState = history.pushState;
                            const replaceState = history.replaceState;
                            const back = history.back;

                            history.back = function (...args) {
                                try { back.apply(history, args); } catch (e) {}
                            };
                            history.pushState = function (...args) {
                                try { pushState.apply(history, args); } catch (e) {}
                                try { syncTheme(); } catch (e) {} // Re-sync theme after navigation.
                            };
                            history.replaceState = function (...args) {
                                try { replaceState.apply(history, args); } catch (e) {}
                                try { syncTheme(); } catch (e) {} // Re-sync theme after state replacement.
                            };
                        } catch (e) {}
                    }
                } catch (e) {
                    console.error('App State check Script Error:', e);
                }
      })();`
            }} />
        <ClientHelperScript />
    </>;
}