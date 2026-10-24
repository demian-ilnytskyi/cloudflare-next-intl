import { NextResponse, type NextRequest } from 'next/server.js';
import config from '@intl-config';
import decodeJwtPayload from '../decode_jwt_payload.js';
import isWhitelisted from '../is_whitelisted.js';
import withRedirectQuery from '../preserve_redirect_query.js';
import { encodeSessionMarker } from '../session_marker.js';
import seedAppCheckCookie from './seed_app_check_cookie.js';
import { guardedRefresh } from '../guarded_refresh.js';
import {
    defaultSessionCookieName,
    defaultRefreshTokenCookieName,
    defaultSessionMarkerCookieName,
    defaultEmailVerifiedHintCookieName,
    defaultProofRequiredCookieName,
    defaultDeviceProofCookieName,
    DEFAULT_REFRESH_MAX_AGE,
} from '../cookie_names.js';

export {
    defaultSessionCookieName,
    defaultRefreshTokenCookieName,
    defaultSessionMarkerCookieName,
    defaultEmailVerifiedHintCookieName,
    defaultAppCheckTokenCookieName,
    defaultProofRequiredCookieName,
    defaultDeviceProofCookieName,
    DEFAULT_REFRESH_MAX_AGE,
    REBIND_MAX_AUTH_AGE_SECONDS,
} from '../cookie_names.js';

export const defaultResetPasswordPath = '/reset-password';

/**
 * Firebase's console exposes ONE project-wide action URL, so every email
 * template (password reset, email verification, email recovery) lands on that
 * same URL and distinguishes itself only by `?mode=`. This maps those raw
 * `mode` values onto the app's own pages so each link reaches the page that
 * knows how to consume its `oobCode`.
 */
function resolveActionModePaths(fa: NonNullable<typeof config.firebaseAuth>): Record<string, string> {
    const paths: Record<string, string> = {
        resetPassword: fa.resetPasswordPath ?? defaultResetPasswordPath,
    };
    if (fa.verifyEmailPath) paths.verifyEmail = fa.verifyEmailPath;
    if (fa.recoverEmailPath) paths.recoverEmail = fa.recoverEmailPath;
    if (fa.signInPath) paths.signIn = fa.signInPath;
    return { ...paths, ...fa.actionModePaths };
}

export const DEFAULT_SESSION_MAX_AGE = 60 * 60 * 24 * 5;

/**
 * The session/refresh cookie attributes, shared by every writer so the
 * middleware and the RSC-side refresh can't drift into writing the same
 * cookie pair with different flags or lifetimes.
 *
 * @param secure `false` only for a plain-http local dev origin — a `secure`
 *   cookie is silently dropped there.
 */
export function sessionCookieOptions(
    fa: NonNullable<typeof config.firebaseAuth>,
    secure: boolean,
): { session: Record<string, unknown>; refresh: Record<string, unknown> } {
    const shared = { httpOnly: true, secure, sameSite: 'lax' as const, path: '/' };
    return {
        session: { ...shared, maxAge: fa.sessionCookieMaxAge ?? DEFAULT_SESSION_MAX_AGE },
        refresh: { ...shared, maxAge: fa.refreshTokenCookieMaxAge ?? DEFAULT_REFRESH_MAX_AGE },
    };
}

export function isSecureRequest(request: NextRequest): boolean {
    return request.nextUrl.protocol === 'https:';
}

// Refresh slightly before the real expiry — treating a token as expired
// right up to its last second means normal clock skew or in-flight request
// time can hand a client a token that dies moments after this check, forcing
// an extra round-trip on the very next request.
export {
    refreshIdToken,
    type RefreshResult,
    isIdTokenExpired,
    isTokenExpired,
    isJwtExpired,
} from '../refresh_id_token.js';
import { isTokenExpired } from '../refresh_id_token.js';

/**
 * Layers Firebase session-cookie validation/refresh and auth redirects onto
 * an already-built middleware response. Called internally by `intlMiddleware`
 * (via dynamic import) when `config.firebaseAuth` is set and
 * `middlewareEnabled !== false` — not intended to be called directly unless
 * that auto-wiring is opted out of.
 *
 * @param baseResponse The response `intlMiddleware` already produced for
 *   locale routing (its own next()/rewrite()/redirect(), with the locale
 *   cookie / bot cookie / `Content-Language` header already set). On the
 *   pass-through path this function returns `baseResponse` itself (with
 *   Firebase cookies layered on) so none of that is dropped; on the
 *   guest/auth-page redirect paths it returns a NEW response instead, since
 *   a redirect response can't also carry forward a rewrite/next decision —
 *   its cookies/headers are copied across from `baseResponse` so locale
 *   state still survives the redirect.
 * @param locale The effective locale `intlMiddleware` resolved for this request.
 */
export default async function updateSession(
    request: NextRequest,
    baseResponse: NextResponse,
    locale: string,
    rebuildResponse?: (request: NextRequest) => NextResponse,
): Promise<NextResponse> {
    const fa = config.firebaseAuth;
    if (!fa || fa.middlewareEnabled === false) return baseResponse;

    // `decodeJwtPayload` re-does a base64 decode + 3 regex execs per call.
    // Several branches below independently ask the same question of the
    // same token (e.g. "is email_verified false?" then later "...true?"
    // after nothing changed it) — memoize per unique token string for the
    // lifetime of this one call, not process-wide (a refreshed token is a
    // different string and must decode fresh).
    const decodedTokenCache = new Map<string, ReturnType<typeof decodeJwtPayload>>();
    function decodeTokenOnce(t: string): ReturnType<typeof decodeJwtPayload> {
        if (decodedTokenCache.has(t)) return decodedTokenCache.get(t)!;
        const decoded = decodeJwtPayload(t);
        decodedTokenCache.set(t, decoded);
        return decoded;
    }

    const sessionCookieName = fa.sessionCookieName ?? defaultSessionCookieName;
    const refreshTokenCookieName = fa.refreshTokenCookieName ?? defaultRefreshTokenCookieName;
    const sessionMarkerCookieName = fa.sessionMarkerCookieName ?? defaultSessionMarkerCookieName;
    const emailVerifiedHintCookieName = fa.emailVerifiedHintCookieName ?? defaultEmailVerifiedHintCookieName;
    const proofCookieName = fa.deviceProofCookieName ?? defaultDeviceProofCookieName;
    const proof = request.cookies.get(proofCookieName)?.value;

    const rawPath = request.nextUrl.pathname;
    const requestPrefix = `/${locale}`;
    const path = rawPath === requestPrefix || rawPath.startsWith(`${requestPrefix}/`)
        ? rawPath.slice(requestPrefix.length) || '/'
        : rawPath;

    const lastSegment = rawPath.slice(rawPath.lastIndexOf('/') + 1);
    if (rawPath.startsWith('/_next') || /\.[a-zA-Z0-9]+$/.test(lastSegment)) {
        return baseResponse;
    }

    const isPrefetch = isPrefetchRequest(request);

    const localePrefix = locale === config.defaultLocale ? '' : requestPrefix;
    const localeUrl = (target: string) => new URL(
        withRedirectQuery(`${localePrefix}${target === '/' ? '' : target}` || '/', request.nextUrl.search),
        request.url,
    );

    // Emailed Firebase action links all arrive on the single project-wide
    // action URL carrying `?mode=<action>&oobCode=...`. Forward them to the
    // page for that mode BEFORE any auth/whitelist check below: these links
    // are followed by users who are typically signed OUT (a password reset,
    // or verification opened in another browser), so letting the guest
    // redirect run first would bounce them to `redirectAuthPath` and discard
    // the `oobCode` they came to spend. The whole query string is preserved
    // so the destination page still receives `oobCode`/`continueUrl`/`lang`.
    // When `actionLinkPath` is set, only requests to that exact (locale-
    // stripped) path are eligible — matches a Firebase Console action URL
    // pinned to one static path (e.g. "https://example.com/auth/action")
    // rather than the bare domain root.
    const isEligibleActionPath = !fa.actionLinkPath || path === fa.actionLinkPath;
    if (fa.actionLinkRedirectEnabled !== false && isEligibleActionPath) {
        const mode = request.nextUrl.searchParams.get('mode');
        if (mode) {
            let target: string | undefined = resolveActionModePaths(fa)[mode];

            // Already on the page this mode routes to: the link has arrived.
            // Following `continueUrl` from here would send it back to the
            // action URL, which forwards to this same target again — an
            // endless 307 ping-pong.
            if (fa.followSameOriginContinueUrl !== false && target !== path) {
                const continueUrl = request.nextUrl.searchParams.get('continueUrl');
                if (continueUrl) {
                    try {
                        const parsed = new URL(continueUrl, request.url);
                        if (parsed.origin === request.nextUrl.origin) {
                            let continuePath = parsed.pathname;
                            if (locale !== config.defaultLocale) {
                                if (continuePath.startsWith(`/${locale}/`)) {
                                    continuePath = continuePath.slice(locale.length + 1);
                                } else if (continuePath === `/${locale}`) {
                                    continuePath = '/';
                                }
                            }
                            // A continueUrl pointing back at the request's own
                            // path (e.g. the single project-wide action URL
                            // echoing itself as `actionCodeSettings.url`)
                            // carries no routing information — keep the
                            // mode-derived target instead of overwriting it
                            // with a no-op.
                            if (continuePath !== '/' && continuePath !== path) {
                                target = continuePath;
                            }


                        } else {
                            if (parsed.pathname === '/') {
                                if (fa.actionLinkPath) {
                                    parsed.pathname = fa.actionLinkPath;
                                } else if (target) {
                                    parsed.pathname = `${localePrefix}${target}`;
                                }
                            }
                            parsed.search = request.nextUrl.search;
                            return buildRedirect(baseResponse, parsed, isPrefetch);
                        }
                    } catch {
                        // Invalid continueUrl format — fall back to resolved mode target
                    }
                }
            }


            // Skip when already on the destination — the forward sets the same
            // `?mode=` it matched on, so redirecting again would loop forever.
            if (target && target !== path) {
                const url = localeUrl(target);
                url.search = request.nextUrl.search;
                // Staying on this origin: only `oobCode` (plus anything the app
                // put there itself) is still needed. Dropping Firebase's own
                // routing params keeps the landed URL clean and makes a second
                // forwarding pass impossible.
                // `signIn` is the exception: `signInWithEmailLink` re-parses
                // the landed URL and needs Firebase's own `mode`/`apiKey`
                // intact, unlike the bare-`oobCode` reset/verify flows.
                if (fa.stripActionLinkQuery !== false && mode !== 'signIn') {
                    for (const key of ['mode', 'apiKey', 'lang', 'continueUrl']) {
                        url.searchParams.delete(key);
                    }
                }
                return buildRedirect(baseResponse, url, isPrefetch);
            }
        }
    }


    const isWhiteListed = fa.protectedPaths
        ? !fa.protectedPaths(path) && !fa.isAuthPath(path)
        : isWhitelisted(path, fa.whiteListPaths);
    if (isWhiteListed) return baseResponse;

    const isAuthPage = fa.isAuthPath(path);
    let token = request.cookies.get(sessionCookieName)?.value;
    let refreshedToken: { idToken: string; refreshToken: string; bound?: boolean } | null = null;
    let clearInvalidSession = false;
    // A transient refresh failure (network blip, Google 5xx, timeout) means
    // "couldn't confirm the session right now" — NOT "this user is signed
    // out". Redirecting to login in that case is the bug this guards
    // against: it signs a still-valid user out for a one-off hiccup, and
    // the client SDK (which still has a live session independent of these
    // cookies) then bounces them straight back, producing a login flash.
    let refreshWasTransientFailure = false;
    let proofRequired = false;

    if (token && isTokenExpired(decodeTokenOnce(token))) {
        token = undefined;
    }

    if (!token) {
        const refreshToken = request.cookies.get(refreshTokenCookieName)?.value;
        if (refreshToken) {
            const result = await guardedRefresh(fa, refreshToken, proof);
            if (result.status === 'refreshed') {
                refreshedToken = { idToken: result.idToken, refreshToken: result.refreshToken, bound: result.bound };
                token = refreshedToken.idToken;
            } else if (result.status === 'invalid') {
                clearInvalidSession = true;
            } else if (result.status === 'proof-required') {
                refreshWasTransientFailure = true;
                proofRequired = true;
            } else {
                refreshWasTransientFailure = true;
            }
        } else if (request.cookies.get(sessionCookieName)) {
            clearInvalidSession = true;
        }
    }

    const hasSession = !!token;
    let response: NextResponse;

    const isVerifyEmailPage = !!fa.verifyEmailPath && path === fa.verifyEmailPath;

    // The session cookie's `email_verified` claim is only as fresh as the
    // last ID-token mint — it does NOT update the moment a user clicks an
    // emailed verification link, only once the token naturally refreshes
    // (up to ~1hr later). AuthUserProvider (client) mirrors the live SDK
    // state into `emailVerifiedHintCookieName` on every auth-state change,
    // so it reflects verification status sooner than the session JWT does.
    // Force one refresh to confirm before redirecting whenever that hint
    // can't yet vouch for this claim: it disagrees outright, or it's absent
    // (e.g. first request before the client has run at all, or a hint
    // that expired/was never set) — either way there's no positive signal
    // the claim is still accurate. Only when the hint AGREES with the claim
    // is a refresh skipped, so a genuinely unverified user with an
    // established, agreeing hint doesn't pay a refresh on every request.
    // On verifyEmailPath itself the branch above deliberately never runs, so
    // a token minted before the user verified keeps the page pinned even
    // after the client has confirmed verification and mirrored it into the
    // hint cookie. Refresh once when the hint claims `true` against a stale
    // `false` claim, so the redirect-home branch below can observe it.
    if (isVerifyEmailPage && hasSession && !refreshedToken
        && decodeTokenOnce(token!)?.email_verified === false
        && request.cookies.get(emailVerifiedHintCookieName)?.value === 'true') {
        const refreshToken = request.cookies.get(refreshTokenCookieName)?.value;
        if (refreshToken) {
            const result = await guardedRefresh(fa, refreshToken, proof);
            if (result.status === 'refreshed') {
                refreshedToken = { idToken: result.idToken, refreshToken: result.refreshToken, bound: result.bound };
                token = refreshedToken.idToken;
            } else if (result.status === 'invalid') {
                clearInvalidSession = true;
            } else if (result.status === 'proof-required') {
                proofRequired = true;
            }
        }
    }

    let unverifiedEmail = false;
    if (fa.verifyEmailPath && !isVerifyEmailPage && hasSession && decodeTokenOnce(token!)?.email_verified === false) {
        // Sending a user to `verifyEmailPath` is only safe when this claim
        // reflects the LIVE account state, because that page resolves the
        // same user through `getAuthUser()`/`initializeServerApp` — which
        // reads the Auth service directly, not this frozen claim — and
        // redirects home the moment it sees a verified user. Any disagreement
        // between the two is therefore not a stale-data annoyance but an
        // infinite redirect loop.
        //
        // The hint cookie cannot settle that: it is a client-written mirror,
        // and after the user verifies in another tab (or the client simply
        // never re-runs) it keeps asserting a `false` that is now wrong,
        // while the Auth service already reports verified. Trusting a
        // `'false'` hint as confirmation is exactly what pinned verified
        // users in the loop. So the hint is only ever allowed to SKIP work
        // when it agrees the user is verified — never to prove they aren't.
        const hint = request.cookies.get(emailVerifiedHintCookieName)?.value;
        if (!refreshedToken) {
            const refreshToken = request.cookies.get(refreshTokenCookieName)?.value;
            if (refreshToken) {
                // `skipCache`: the cached entry is what produced the very
                // token whose claim is in question, so a cached refresh can
                // hand back that same token and confirm nothing.
                const result = await guardedRefresh(fa, refreshToken, proof, { skipCache: true });
                if (result.status === 'refreshed') {
                    refreshedToken = { idToken: result.idToken, refreshToken: result.refreshToken, bound: result.bound };
                    token = refreshedToken.idToken;
                    // A `true` hint means the client already observed
                    // verification live; never redirect against it, even if
                    // this mint's claim hasn't caught up.
                    unverifiedEmail = hint !== 'true' && decodeTokenOnce(token)?.email_verified === false;
                } else if (result.status === 'invalid') {
                    clearInvalidSession = true;
                } else if (result.status === 'proof-required') {
                    proofRequired = true;
                    unverifiedEmail = true;
                } else {
                    // Transient failure — can't confirm the live claim, fall
                    // back to trusting the (possibly stale) existing claim
                    // rather than blocking the request.
                    unverifiedEmail = true;
                }
            } else {
                // No refresh token to re-check with — trust the existing claim.
                unverifiedEmail = true;
            }
        } else {
            unverifiedEmail = hint !== 'true' && decodeTokenOnce(token!)?.email_verified === false;
        }
    }

    if (refreshWasTransientFailure) {
        // Couldn't confirm the session either way — pass through without
        // forcing a redirect in either direction. The next request (or the
        // client SDK's own session, independent of these cookies) gets a
        // chance to resolve this correctly instead of guessing wrong.
        response = baseResponse;
    } else if (!hasSession || clearInvalidSession) {
        response = isAuthPage ? baseResponse : buildRedirect(baseResponse, localeUrl(fa.redirectAuthPath), isPrefetch);
    } else if (unverifiedEmail) {
        // Checked before the auth-page redirect: an unverified signed-in
        // user must land on verifyEmailPath even if they navigated to an
        // auth page like /login — homePath is not a state they're allowed
        // to reach yet either.
        response = buildRedirect(baseResponse, localeUrl(fa.verifyEmailPath!), isPrefetch);
    } else if (isVerifyEmailPage && decodeTokenOnce(token!)?.email_verified === true) {
        // A verified user has no reason to be on verifyEmailPath —
        // "you're done here, go home".
        // `unverifiedEmail` can't be reused here: its own computation
        // deliberately skips verifyEmailPath (so it never redirects AWAY
        // from that page for an unverified user), so it's always `false`
        // while already on it regardless of actual verification status —
        // checking the claim again directly is what tells verified and
        // unverified apart on this specific page. Requires an EXPLICIT
        // `true` (not just "not false") — a missing/undefined claim must
        // NOT redirect home here, since `AuthUserProvider`'s client-side
        // effect treats that same user as unverified via the live SDK's
        // boolean `user.emailVerified`. The two disagreeing caused an
        // infinite client<->server redirect loop on this exact page when a
        // token's claim was merely absent rather than `false`.
        response = buildRedirect(baseResponse, localeUrl(fa.homePath), isPrefetch);
    } else {
        response = baseResponse;
    }

    if (clearInvalidSession) {
        response.cookies.delete(sessionCookieName);
        response.cookies.delete(refreshTokenCookieName);
        response.cookies.delete(sessionMarkerCookieName);
        response.cookies.delete(defaultProofRequiredCookieName);
    }

    let didModifyRequest = false;

    if (proofRequired) {
        request.cookies.set(defaultProofRequiredCookieName, '1');
        didModifyRequest = true;
        response.cookies.set(defaultProofRequiredCookieName, '1', {
            httpOnly: false,
            secure: isSecureRequest(request),
            sameSite: 'lax',
            path: '/',
            maxAge: 60,
        });
    }

    if (refreshedToken) {
        // `response.cookies.set` only reaches the BROWSER — the current
        // render still reads the old, expired token from `cookies()`, so
        // `initializeServerApp` rejects it with `auth/invalid-user-token`.
        // Writing to `request.cookies` and rebuilding the pass-through
        // response from that request makes the fresh token visible to this
        // render too.
        request.cookies.set(sessionCookieName, refreshedToken.idToken);
        request.cookies.set(refreshTokenCookieName, refreshedToken.refreshToken);
        didModifyRequest = true;

        const cookieOptions = sessionCookieOptions(fa, isSecureRequest(request));
        response.cookies.set(sessionCookieName, refreshedToken.idToken, cookieOptions.session);
        response.cookies.set(refreshTokenCookieName, refreshedToken.refreshToken, cookieOptions.refresh);
        response.cookies.delete(defaultProofRequiredCookieName);
        const markerMaxAge = fa.refreshTokenCookieMaxAge ?? DEFAULT_REFRESH_MAX_AGE;
        const markerValue = await encodeSessionMarker(
            Math.floor(Date.now() / 1000) + markerMaxAge,
            refreshedToken.refreshToken,
            Boolean(refreshedToken.bound),
        );
        response.cookies.set(sessionMarkerCookieName, markerValue, {
            httpOnly: false,
            secure: isSecureRequest(request),
            sameSite: 'lax',
            path: '/',
            maxAge: markerMaxAge,
        });
    }

    if (hasSession && !clearInvalidSession && !refreshWasTransientFailure) {
        const didSeed = await seedAppCheckCookie(request, response, fa);
        if (didSeed) didModifyRequest = true;
    }

    if (didModifyRequest && rebuildResponse && response === baseResponse) {
        const rebuilt = rebuildResponse(request);
        copyResponseState(baseResponse, rebuilt);
        response = rebuilt;
    }

    return response;
}

/** A redirect response can't carry forward `baseResponse`'s rewrite/next decision, so this copies its cookies/headers across instead of dropping them. */
// A router prefetch must never be answered with a redirect. Next's segment
// cache stores the entry under the REQUESTED url while `fetch` transparently
// follows the 3xx, so the entry it caches describes a different route than the
// key it is filed under; the router then keeps re-requesting it, which
// re-redirects, an unbounded prefetch loop that hammers the origin (every
// signed-out page carrying a `<Link>` to a guarded route reproduced it).
// An empty 204 is treated as an un-cacheable prefetch miss instead: the router
// backs off, and the guard still runs in full on the real navigation, which
// is never a prefetch.
export function isPrefetchRequest(request: NextRequest): boolean {
    return request.headers.get('next-router-prefetch') === '1'
        || request.headers.get('purpose') === 'prefetch'
        || request.headers.get('x-purpose') === 'prefetch';
}

// `Headers.forEach` yields each Set-Cookie separately and `headers.set` keeps
// only the last one, so copying them as headers drops every cookie but one
// (e.g. `__cf_country__`, which the consent banner needs on first paint).
function copyResponseState(from: NextResponse, to: NextResponse): void {
    from.headers.forEach((value, key) => {
        if (key !== 'set-cookie') to.headers.set(key, value);
    });
    from.cookies.getAll().forEach((cookie) => to.cookies.set(cookie));
}

function buildRedirect(baseResponse: NextResponse, url: URL, isPrefetch = false): NextResponse {
    if (isPrefetch) {
        return new NextResponse(null, {
            status: 204,
            headers: { 'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate' },
        });
    }
    const redirectResponse = NextResponse.redirect(url);
    copyResponseState(baseResponse, redirectResponse);
    // Explicitly prevent OpenNext/Cloudflare from caching these auth redirects.
    redirectResponse.headers.set('Cache-Control', 'private, no-cache, no-store, max-age=0, must-revalidate');
    return redirectResponse;
}

export { isAuthProofPending } from '../guarded_refresh.js';
