import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { isDarkCookieKey, localeCookieName } from "../../config/cookie_key.js";
import config from "../../config/intl_config.js";
import ClientHelperScript from "../../client/components/client_helper_script.js";
import { defaultStaleDeployPatterns } from "../../error_handling/is_stale_deploy_error.js";
const isDev = process.env.NODE_ENV === 'development';
export const defaultReloadHtml = '<div style="position:fixed;inset:0;background:#ffffff;display:flex;align-items:center;justify-content:center;z-index:9999999;"><div style="width:36px;height:36px;border:3px solid #e5e7eb;border-top-color:#17181b;border-radius:50%;animation:cfni-spin 0.8s linear infinite;"></div><style>@keyframes cfni-spin{to{transform:rotate(360deg)}}</style></div>';
const appCheck = config.firebaseAuth?.appCheck;
const shouldLoadExplicitRecaptchaScript = !!appCheck?.recaptchaV3SiteKey && appCheck.useExplicitRecaptchaScript !== false;
const secureCookieAttribute = isDev ? '+ " Secure;"' : '';
export default function HelperScript() {
    const reloadHtml = config.errorHandling?.staleDeployReloadHtml ?? defaultReloadHtml;
    return _jsxs(_Fragment, { children: [shouldLoadExplicitRecaptchaScript &&
                _jsx("script", { src: "https://www.google.com/recaptcha/api.js?render=explicit", async: true, defer: true }), !isDev &&
                _jsx("script", { id: "stale-deploy-early-catch", dangerouslySetInnerHTML: {
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
                var overlayStyleId = 'cfni-stale-deploy-style';
                var overlayWanted = false;
                function showOverlay() {
                    overlayWanted = true;
                    try {
                        // A chunk can fail while the parser is still inside
                        // <head>, before <body> or the error UI exist. A style
                        // rule can be installed right then and applies to
                        // whatever the parser produces next, so the error UI
                        // never gets a frame; the spinner is appended once
                        // there is a <body> to hold it.
                        if (!document.getElementById(overlayStyleId)) {
                            var st = document.createElement('style');
                            st.id = overlayStyleId;
                            st.textContent = [
                                'html,body{background:#ffffff !important}',
                                'body>*:not(#' + overlayId + '){visibility:hidden !important}',
                                // Until <body> exists there is nowhere to put
                                // the spinner element, and a blank screen reads
                                // as a hang. A pseudo-element needs no host, so
                                // it covers that gap and steps aside as soon as
                                // the real overlay is in the document.
                                'html:not(:has(#' + overlayId + '))::after{content:"";position:fixed;top:50%;left:50%;width:2.25rem;height:2.25rem;margin:-1.125rem 0 0 -1.125rem;border:0.1875rem solid #e5e7eb;border-top-color:#17181b;border-radius:50%;animation:cfni-spin 0.8s linear infinite;z-index:2147483647}',
                                '@keyframes cfni-spin{to{transform:rotate(360deg)}}'
                            ].join('');
                            (document.head || document.documentElement).appendChild(st);
                        }
                        if (document.getElementById(overlayId)) return;
                        if (!document.body) {
                            document.addEventListener('DOMContentLoaded', function() {
                                if (overlayWanted) showOverlay();
                            }, { once: true });
                            setTimeout(function() { if (overlayWanted) showOverlay(); }, 0);
                            return;
                        }
                        var el = document.createElement('div');
                        el.id = overlayId;
                        el.setAttribute('style', 'position:fixed;inset:0;z-index:2147483647;background:#ffffff;');
                        el.innerHTML = ${JSON.stringify(reloadHtml)};
                        document.body.appendChild(el);
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
                        // Cloudflare serves its bot-challenge scripts from the
                        // site's own origin, so they pass the same-origin test
                        // while having nothing to do with the build. Probing
                        // one never yields JavaScript and a failed challenge
                        // cannot break the module graph.
                        try { if (new URL(src, window.location.href).pathname.indexOf('/cdn-cgi/') === 0) return; } catch (err3) { return; }
                        if (!probeUrl) probeUrl = src;
                        recover('chunk resource failed to load: ' + src, 'resource-error');
                    } catch (err) {}
                }, true);
                window.addEventListener('unhandledrejection', function(e) {
                    recover(e.reason && (e.reason.message || e.reason), 'unhandledrejection');
                });
                } catch (e) { try { console.error('Stale Deploy Early Catch Script Error:', e); } catch (e2) {} }
      })();`
                    } }), !isDev &&
                _jsx("script", { id: "build-id-script", dangerouslySetInnerHTML: {
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
                    } }), _jsx("script", { id: "intl-app-state-checker", dangerouslySetInnerHTML: {
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
                } }), _jsx(ClientHelperScript, {})] });
}
