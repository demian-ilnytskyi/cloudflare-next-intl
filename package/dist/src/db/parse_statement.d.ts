import { type SqlValue, type WhereNode } from './parse_where';
/** One selected/returned column, with its output name when aliased. */
export interface Projection {
    column: string;
    alias?: string;
}
/** One `order by` term. */
export interface OrderBy {
    column: string;
    ascending: boolean;
    nullsFirst?: boolean;
}
/** A single-table `select` reduced to what PostgREST can express. */
export interface ParsedSelect {
    kind: 'select';
    table: string;
    projection: Projection[] | 'all' | 'count';
    where?: WhereNode;
    orderBy: OrderBy[];
    limit?: SqlValue;
    offset?: SqlValue;
}
/** The `excluded.<column>` reference an upsert's `do update set` may use. */
export interface ExcludedRef {
    kind: 'excluded';
    column: string;
}
/** A parsed `on conflict` clause. */
export type OnConflict = {
    columns: string[];
    action: 'nothing';
} | {
    columns: string[];
    action: 'update';
    set: Record<string, SqlValue | ExcludedRef>;
};
/** A single-table `insert`, optionally an upsert, optionally `returning`. */
export interface ParsedInsert {
    kind: 'insert';
    table: string;
    columns: string[];
    rows: SqlValue[][];
    onConflict?: OnConflict;
    returning?: Projection[] | 'all';
}
/** A single-table `update`. */
export interface ParsedUpdate {
    kind: 'update';
    table: string;
    set: Record<string, SqlValue>;
    where?: WhereNode;
    returning?: Projection[] | 'all';
}
/** A single-table `delete`. */
export interface ParsedDelete {
    kind: 'delete';
    table: string;
    where?: WhereNode;
    returning?: Projection[] | 'all';
}
/** Any statement the REST executor knows how to run. */
export type ParsedStatement = ParsedSelect | ParsedInsert | ParsedUpdate | ParsedDelete;
export default function parseStatement(sql: string): ParsedStatement;
