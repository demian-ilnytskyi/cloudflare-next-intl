import config from '@intl-config';
import reportError from '../../error_handling/report_error.js';
import signCustomTokenRemote from './sign_custom_token_remote.js';
const APP_CHECK_CUSTOM_TOKEN_AUDIENCE = 'https://firebaseappcheck.googleapis.com/google.firebase.appcheck.v1.TokenExchangeService';
const CUSTOM_TOKEN_LIFETIME = '5m';
export const missingCredentialsReportState = { reported: false };
async function reportMissingCredentials(appCheck, hasOauthTriple) {
    if (appCheck.reportMissingServerCredentials === false)
        return;
    if (missingCredentialsReportState.reported)
        return;
    missingCredentialsReportState.reported = true;
    const missing = [];
    if (!appCheck.clientEmail)
        missing.push('clientEmail');
    if (!appCheck.appId)
        missing.push('appId');
    if (!appCheck.privateKey && !hasOauthTriple) {
        missing.push('privateKey (or the full oauthClientId/oauthClientSecret/oauthRefreshToken triple)');
    }
    await reportError(config, {
        error: new Error(`firebaseAuth.appCheck is configured but cannot mint an App Check token server-side — missing: ${missing.join(', ')}. `
            + 'Signed-in users will render as signed-out on any cold navigation that arrives before the client writes the App Check cookie. '
            + 'Set the missing service-account values, or pass `appCheck.reportMissingServerCredentials: false` to silence this.'),
        classOrMethodName: 'mintServerAppCheckToken',
        dedupKey: 'mintServerAppCheckToken:missing-server-credentials',
    });
}
export default async function mintServerAppCheckToken(projectId, apiKey, appCheck) {
    if (!appCheck)
        return undefined;
    const hasOauthTriple = Boolean(appCheck.oauthClientId && appCheck.oauthClientSecret && appCheck.oauthRefreshToken);
    if (!appCheck.clientEmail || !appCheck.appId || (!appCheck.privateKey && !hasOauthTriple)) {
        await reportMissingCredentials(appCheck, hasOauthTriple);
        return undefined;
    }
    try {
        const claims = {
            iss: appCheck.clientEmail,
            sub: appCheck.clientEmail,
            aud: APP_CHECK_CUSTOM_TOKEN_AUDIENCE,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 300,
            app_id: appCheck.appId,
        };
        const customToken = appCheck.privateKey
            ? await (async () => {
                const { SignJWT, importPKCS8 } = await import('jose');
                const privateKey = await importPKCS8(appCheck.privateKey.replace(/\\n/g, '\n'), 'RS256');
                return new SignJWT({ app_id: appCheck.appId })
                    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
                    .setIssuer(appCheck.clientEmail)
                    .setSubject(appCheck.clientEmail)
                    .setAudience(APP_CHECK_CUSTOM_TOKEN_AUDIENCE)
                    .setIssuedAt()
                    .setExpirationTime(CUSTOM_TOKEN_LIFETIME)
                    .sign(privateKey);
            })()
            : await signCustomTokenRemote(appCheck.clientEmail, claims, {
                clientId: appCheck.oauthClientId,
                clientSecret: appCheck.oauthClientSecret,
                refreshToken: appCheck.oauthRefreshToken,
            });
        const url = `https://firebaseappcheck.googleapis.com/v1/projects/${projectId}/apps/${appCheck.appId}:exchangeCustomToken?key=${apiKey}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customToken }),
        });
        if (!res.ok) {
            await reportError(config, {
                error: new Error(`exchangeCustomToken failed: ${res.status} ${await res.text()}`),
                classOrMethodName: 'mintServerAppCheckToken',
            });
            return undefined;
        }
        const data = await res.json();
        return data.token;
    }
    catch (error) {
        await reportError(config, { error, classOrMethodName: 'mintServerAppCheckToken' });
        return undefined;
    }
}
