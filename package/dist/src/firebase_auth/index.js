export { default as FirebaseAuthClientProvider } from './client/auth_user_provider';
export { default as FirebaseAuthServerProvider } from './server/auth_user_server_provider';
// NOTE: no single `useFirebaseAuthUser` re-export here — the barrel is a
// plain module graph with no bundler-conditional resolution, so it cannot
// replicate the react-server/default split package.json's exports map
// provides for the ./useFirebaseAuthUser subpath. A consumer wanting the
// hook imports `cloudflare-next-intl/useFirebaseAuthUser` directly (which
// DOES resolve correctly per-environment) rather than through this barrel.
export { default as useFirebaseAuthUserClient } from './client/use_auth_user';
export { default as useFirebaseAuthUserServer } from './server/use_auth_user_server';
export { createLoginAction, createSignUpAction, createForgotPasswordAction } from './client/auth_actions';
export { default as clearFirebaseAuthSession } from './server/clear_session_action';
export { default as updateFirebaseAuthSession, defaultSessionCookieName as firebaseAuthSessionCookieName } from './middleware/update_session';
export { getFirebaseAuthClient, getFirebasePerformanceSync } from './client/firebase_client';
