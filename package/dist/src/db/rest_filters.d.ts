import type { SqlValue, WhereNode } from './parse_where.js';
/**
 * The subset of `@supabase/postgrest-js`'s filter methods this module calls,
 * declared structurally so nothing here imports `@supabase/supabase-js`.
 */
export interface FilterTarget {
    eq(column: string, value: unknown): FilterTarget;
    neq(column: string, value: unknown): FilterTarget;
    gt(column: string, value: unknown): FilterTarget;
    gte(column: string, value: unknown): FilterTarget;
    lt(column: string, value: unknown): FilterTarget;
    lte(column: string, value: unknown): FilterTarget;
    like(column: string, pattern: string): FilterTarget;
    ilike(column: string, pattern: string): FilterTarget;
    is(column: string, value: null): FilterTarget;
    in(column: string, values: readonly unknown[]): FilterTarget;
    not(column: string, operator: string, value: unknown): FilterTarget;
    or(filters: string): FilterTarget;
    regexMatch(column: string, pattern: string): FilterTarget;
    regexIMatch(column: string, pattern: string): FilterTarget;
    contains(column: string, value: unknown): FilterTarget;
    containedBy(column: string, value: unknown): FilterTarget;
    overlaps(column: string, value: unknown): FilterTarget;
    rangeGt(column: string, range: unknown): FilterTarget;
    rangeGte(column: string, range: unknown): FilterTarget;
    rangeLt(column: string, range: unknown): FilterTarget;
    rangeLte(column: string, range: unknown): FilterTarget;
    rangeAdjacent(column: string, range: unknown): FilterTarget;
    isDistinct(column: string, value: unknown): FilterTarget;
    textSearch(column: string, query: string, opts?: {
        type?: 'plain' | 'phrase' | 'websearch';
        config?: string;
    }): FilterTarget;
}
/**
 * Reads a parsed value against the statement's positional parameters.
 *
 * @param value A placeholder reference or an inline literal.
 * @param params The statement's positional parameters, 1-indexed by `$n`.
 * @returns The JavaScript value to send to PostgREST.
 * @throws {UnsupportedSqlError} If a placeholder has no matching parameter.
 */
export declare function resolveValue(value: SqlValue, params: unknown[]): unknown;
/**
 * Applies a parsed `where` tree to a PostgREST query builder.
 *
 * A top-level `and` becomes one builder call per child, which is what
 * PostgREST already means by stacked filters. Anything with an `or` or `not`
 * in it has to travel as a single serialised filter string instead, because
 * that is the only way PostgREST expresses boolean structure.
 *
 * @param builder The query builder to apply filters to.
 * @param node The parsed `where` tree.
 * @param params The statement's positional parameters.
 * @returns The builder, for chaining.
 * @throws {UnsupportedSqlError} If a value cannot be carried by the filter
 * syntax the node requires.
 */
export default function applyWhere<T extends FilterTarget>(builder: T, node: WhereNode, params: unknown[]): T;
