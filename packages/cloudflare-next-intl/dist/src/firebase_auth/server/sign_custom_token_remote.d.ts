export default function signCustomTokenRemote(clientEmail: string, claims: Record<string, unknown>, oauth: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
}): Promise<string>;
