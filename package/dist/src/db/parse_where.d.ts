import type { SqlToken } from './sql_tokens';
/** A value in a parsed clause: a `$n` placeholder or an inline literal. */
export type SqlValue = {
    kind: 'param';
    index: number;
} | {
    kind: 'literal';
    value: string | number | boolean | null;
};
/** PostgREST-expressible comparison operators. */
export type CompareOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'regexMatch' | 'regexIMatch' | 'contains' | 'containedBy' | 'overlaps' | 'rangeGt' | 'rangeGte' | 'rangeLt' | 'rangeLte' | 'rangeAdjacent' | 'isDistinct';
/** One node of a parsed `where` tree. */
export type WhereNode = {
    kind: 'and' | 'or';
    children: WhereNode[];
} | {
    kind: 'not';
    child: WhereNode;
} | {
    kind: 'compare';
    column: string;
    operator: CompareOperator;
    value: SqlValue;
} | {
    kind: 'is';
    column: string;
    negated: boolean;
} | {
    kind: 'in';
    column: string;
    values: SqlValue[];
    negated: boolean;
} | {
    kind: 'textSearch';
    column: string;
    value: SqlValue;
    type?: 'plain' | 'phrase' | 'websearch';
    config?: string;
};
/** A parsed `where` tree plus the index the caller should resume from. */
export interface WhereParse {
    node: WhereNode;
    next: number;
}
/**
 * Parses the boolean expression after `where` into a tree the REST layer can
 * map onto PostgREST filters.
 *
 * Only column-versus-value comparisons are accepted: PostgREST filters address
 * one column against one value, so function calls, column-to-column
 * comparisons, and subqueries are rejected here rather than mistranslated.
 *
 * @param tokens The full token list of the statement.
 * @param start Index of the first token after `where`.
 * @returns The parsed tree and the index of the first unconsumed token.
 * @throws {UnsupportedSqlError} If the expression uses anything outside the
 * supported subset.
 */
export default function parseWhere(tokens: SqlToken[], start: number): WhereParse;
