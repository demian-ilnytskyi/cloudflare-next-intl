import type { ParsedStatement } from './parse_statement.js';
import type { RestClient } from './rest_client.js';
export default function executeRest(client: RestClient, statement: ParsedStatement, params: unknown[]): Promise<{
    rows: unknown[][];
    rowCount: number | null;
}>;
