export default function decodeJwtPayload(token: string): {
    exp?: number;
    iat?: number;
    email_verified?: boolean;
} | null;
