import type { CompareOperator, SqlValue, WhereNode } from './parse_where';
import UnsupportedSqlError from './unsupported_sql';

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
    textSearch(column: string, query: string, opts?: { type?: 'plain' | 'phrase' | 'websearch'; config?: string }): FilterTarget;
}

/**
 * Reads a parsed value against the statement's positional parameters.
 *
 * @param value A placeholder reference or an inline literal.
 * @param params The statement's positional parameters, 1-indexed by `$n`.
 * @returns The JavaScript value to send to PostgREST.
 * @throws {UnsupportedSqlError} If a placeholder has no matching parameter.
 */
export function resolveValue(value: SqlValue, params: unknown[]): unknown {
    if (value.kind === 'literal') return value.value;
    if (value.index < 1 || value.index > params.length) {
        throw new UnsupportedSqlError(`placeholder $${value.index} with only ${params.length} param(s)`);
    }
    return params[value.index - 1];
}

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
export default function applyWhere<T extends FilterTarget>(builder: T, node: WhereNode, params: unknown[]): T {
    if (node.kind === 'and') {
        for (const child of node.children) applyWhere(builder, child, params);
        return builder;
    }
    if (node.kind === 'or' || node.kind === 'not') {
        builder.or(serialize(node, params));
        return builder;
    }
    if (node.kind === 'is') {
        if (node.negated) builder.not(node.column, 'is', null);
        else builder.is(node.column, null);
        return builder;
    }
    if (node.kind === 'in') {
        const values = node.values.map((value) => resolveValue(value, params));
        if (node.negated) builder.not(node.column, 'in', values);
        else builder.in(node.column, values);
        return builder;
    }
    if (node.kind === 'textSearch') {
        const query = String(resolveValue(node.value, params));
        const opts: { type?: 'plain' | 'phrase' | 'websearch'; config?: string } = {};
        if (node.type) opts.type = node.type;
        if (node.config) opts.config = node.config;
        if (Object.keys(opts).length) builder.textSearch(node.column, query, opts);
        else builder.textSearch(node.column, query);
        return builder;
    }
    if (node.kind === 'compare') {
        builder[node.operator](node.column, resolveValue(node.value, params) as never);
        return builder;
    }
    return builder;
}

const FILTER_CODES: Record<CompareOperator, string> = {
    eq: 'eq',
    neq: 'neq',
    gt: 'gt',
    gte: 'gte',
    lt: 'lt',
    lte: 'lte',
    like: 'like',
    ilike: 'ilike',
    regexMatch: 'match',
    regexIMatch: 'imatch',
    contains: 'cs',
    containedBy: 'cd',
    overlaps: 'ov',
    rangeGt: 'sr',
    rangeGte: 'nxl',
    rangeLt: 'sl',
    rangeLte: 'nxr',
    rangeAdjacent: 'adj',
    isDistinct: 'isdistinct',
};

const TEXT_SEARCH_CODES = { plain: 'plfts', phrase: 'phfts', websearch: 'wfts' } as const;

function serialize(node: WhereNode, params: unknown[]): string {
    if (node.kind === 'and' || node.kind === 'or') {
        const children = node.children.map((child) => serialize(child, params)).join(',');
        return node.kind === 'and' ? `and(${children})` : children;
    }
    if (node.kind === 'not') return `not.${serialize(node.child, params)}`;
    if (node.kind === 'is') return node.negated ? `not.${node.column}.is.null` : `${node.column}.is.null`;
    if (node.kind === 'in') {
        const values = node.values.map((value) => encodeFilterValue(resolveValue(value, params))).join(',');
        const str = `${node.column}.in.(${values})`;
        return node.negated ? `not.${str}` : str;
    }
    if (node.kind === 'textSearch') {
        const code = node.type ? TEXT_SEARCH_CODES[node.type] : 'fts';
        const config = node.config ? `(${node.config})` : '';
        return `${node.column}.${code}${config}.${encodeFilterValue(resolveValue(node.value, params))}`;
    }
    if (node.kind === 'compare') {
        return `${node.column}.${FILTER_CODES[node.operator]}.${encodeFilterValue(resolveValue(node.value, params))}`;
    }
    throw new UnsupportedSqlError('unsupported where node');
}

function encodeFilterValue(value: unknown): string {
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (typeof value !== 'string') {
        throw new UnsupportedSqlError(`value of type ${value === null ? 'null' : typeof value} inside an or()/not() filter`);
    }
    return /[,.():"\s]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}
