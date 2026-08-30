import type { ParsedStatement } from './parse_statement.js';
import type { RestClient } from './rest_client.js';
/**
 * Runs a parsed statement through PostgREST and reshapes the response into the
 * `{ rows, rowCount }` contract `drizzle-orm/pg-proxy` expects.
 *
 * Rows come back as positional arrays because `pg-proxy` maps result columns
 * by index, which is also why a `select *`/`returning *` cannot be served
 * here: PostgREST gives no column order to map against. Statements without a
 * projection ask PostgREST for an exact count instead of rows, so Drizzle's
 * `rowCount` keeps meaning what it means on a real connection.
 *
 * @param client The Supabase REST client.
 * @param statement The parsed statement.
 * @param params The statement's positional parameters.
 * @returns Rows in projection order and the affected/returned row count.
 * @throws {UnsupportedSqlError} If the statement needs something PostgREST
 * cannot express (`*` projection, an upsert whose `do update set` diverges
 * from the inserted values).
 * @throws If PostgREST rejects the request.
 */
export default function executeRest(client: RestClient, statement: ParsedStatement, params: unknown[]): Promise<{
    rows: unknown[][];
    rowCount: number | null;
}>;
