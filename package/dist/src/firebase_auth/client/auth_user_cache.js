// Module-scope cache so non-React code can read the current client auth
// user synchronously, without needing to be inside AuthUserProvider's tree.
let cachedUser = null;
let cachedLoading = true;
export function setAuthUserCache(user) {
    cachedUser = user;
    cachedLoading = false;
}
export function getAuthUserCache() {
    return cachedUser;
}
export function isAuthUserLoadingCache() {
    return cachedLoading;
}
