/**
 * Signs the App Check custom token claims remotely via IAM Credentials'
 * `signJwt`, instead of locally with a service-account private key. Lets
 * `mintServerAppCheckToken` work under an org policy that enforces
 * `iam.disableServiceAccountKeyCreation` — that constraint blocks
 * `serviceAccounts.keys.create` only; it does not affect `signJwt`, which
 * signs using a key Google holds and never exports.
 *
 * The caller's OAuth identity (the refresh token) must carry
 * `roles/iam.serviceAccountTokenCreator` on `clientEmail` — grant it with:
 * `gcloud iam service-accounts add-iam-policy-binding <clientEmail>
 *   --member="user:<you>" --role="roles/iam.serviceAccountTokenCreator"`.
 */
export default async function signCustomTokenRemote(
    clientEmail: string,
    claims: Record<string, unknown>,
    oauth: { clientId: string; clientSecret: string; refreshToken: string },
): Promise<string> {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: oauth.clientId,
            client_secret: oauth.clientSecret,
            refresh_token: oauth.refreshToken,
            grant_type: 'refresh_token',
        }),
    });
    if (!tokenRes.ok) {
        throw new Error(`oauth2 refresh_token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`);
    }
    const { access_token: accessToken } = await tokenRes.json() as { access_token: string };

    const signRes = await fetch(
        `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${clientEmail}:signJwt`,
        {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ payload: JSON.stringify(claims) }),
        },
    );
    if (!signRes.ok) {
        throw new Error(`iamcredentials.signJwt failed: ${signRes.status} ${await signRes.text()}`);
    }
    const { signedJwt } = await signRes.json() as { signedJwt: string };
    return signedJwt;
}
