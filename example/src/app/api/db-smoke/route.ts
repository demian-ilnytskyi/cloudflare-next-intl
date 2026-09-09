import { withPublicDb } from 'cloudflare-next-intl/db';

export async function GET() {
    try {
        await withPublicDb(async () => 'ok', { connectionString: 'postgres://smoke-test-no-real-connection' });
    } catch (error) {
        // Expected — no real Postgres reachable in this smoke check. The
        // point is that the import resolves and the function is callable,
        // not that the connection succeeds.
        return Response.json({ resolvedButFailedAsExpected: error instanceof Error ? error.message : String(error) });
    }
    return Response.json({ unexpectedlySucceeded: true });
}
