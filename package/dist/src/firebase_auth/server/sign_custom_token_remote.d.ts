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
export default function signCustomTokenRemote(clientEmail: string, claims: Record<string, unknown>, oauth: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
}): Promise<string>;
