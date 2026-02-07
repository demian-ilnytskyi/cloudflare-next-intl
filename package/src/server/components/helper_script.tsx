import { isDarkCookieKey, localeCookieName } from "../../config/cookie_key";
import config from "../../config/intl_config";
import ClientHelperScript from "../../client/components/client_helper_script";

const isDev = process.env.NODE_ENV === 'development';

const secureCookieAttribute = isDev ? '+ " Secure;"' : '';

export default function HelperScript(): Component | null {

    return <>
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
                    const { pathname, search, hash } = window.location;
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