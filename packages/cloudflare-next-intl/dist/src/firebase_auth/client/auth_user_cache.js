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
