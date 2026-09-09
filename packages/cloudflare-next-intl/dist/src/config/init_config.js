import { setStaleDeployPatterns } from '../error_handling/is_stale_deploy_error.js';
const FIREBASE_AUTH_PATH_FIELDS = [
    'redirectAuthPath',
    'homePath',
    'verifyEmailPath',
    'resetPasswordPath',
    'recoverEmailPath',
    'actionLinkPath',
];
function normalizeFirebaseAuthPaths(config) {
    const fa = config.firebaseAuth;
    if (!fa)
        return config;
    let changed = false;
    const normalizedFa = { ...fa };
    for (const field of FIREBASE_AUTH_PATH_FIELDS) {
        const value = normalizedFa[field];
        if (typeof value === 'string' && value !== '' && !value.startsWith('/')) {
            console.warn(`[cloudflare-next-intl] firebaseAuth.${field} ("${value}") is missing its leading "/" — ` +
                `auto-corrected to "/${value}". Paths are compared against the URL pathname (always ` +
                `"/"-prefixed), so without this fix the check would never match and silently disable the ` +
                `redirect/exemption for this path. Fix your config to avoid this warning.`);
            normalizedFa[field] = `/${value}`;
            changed = true;
        }
    }
    if (!changed)
        return config;
    return { ...config, firebaseAuth: normalizedFa };
}
export function setIntlConfig(config) {
    if (config.errorHandling?.staleDeployPatterns) {
        setStaleDeployPatterns(config.errorHandling.staleDeployPatterns);
    }
    return normalizeFirebaseAuthPaths(config);
}
