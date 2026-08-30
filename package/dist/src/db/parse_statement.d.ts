import { type SqlValue, type WhereNode } from './parse_where.js';
export interface Projection {
    column: string;
    alias?: string;
}
export interface OrderBy {
    column: string;
    ascending: boolean;
    nullsFirst?: boolean;
}
export interface ParsedSelect {
    kind: 'select';
    table: string;
    projection: Projection[] | 'all' | 'count';
    where?: WhereNode;
    orderBy: OrderBy[];
    limit?: SqlValue;
    offset?: SqlValue;
}
export interface ExcludedRef {
    kind: 'excluded';
    column: string;
}
export type OnConflict = {
    columns: string[];
    action: 'nothing';
} | {
    columns: string[];
    action: 'update';
    set: Record<string, SqlValue | ExcludedRef>;
};
export interface ParsedInsert {
    kind: 'insert';
    table: string;
    columns: string[];
    rows: SqlValue[][];
    onConflict?: OnConflict;
    returning?: Projection[] | 'all';
}
export interface ParsedUpdate {
    kind: 'update';
    table: string;
    set: Record<string, SqlValue>;
    where?: WhereNode;
    returning?: Projection[] | 'all';
}
export interface ParsedDelete {
    kind: 'delete';
    table: string;
    where?: WhereNode;
    returning?: Projection[] | 'all';
}
export type ParsedStatement = ParsedSelect | ParsedInsert | ParsedUpdate | ParsedDelete;
export default function parseStatement(sql: string): ParsedStatement;
