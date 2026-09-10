import type { CompareOperator, SqlValue, WhereNode } from './parse_where.js';
import UnsupportedSqlError from './unsupported_sql.js';

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
    filter(column: string, operator: string, value: unknown): FilterTarget;
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
        // `.or(f)` already wraps its argument in `or=(f)`, so the top-level
        // node's own `or(...)` wrapper would be doubled — every *nested* group
        // still needs its wrapper, or the tree flattens and changes meaning.
        builder.or(node.kind === 'or' ? serializeChildren(node, params) : serialize(node, params));
        return builder;
    }
    if (node.kind === 'is') {
        if (node.negated) builder.not(node.column, 'is', null);
        else builder.is(node.column, null);
        return builder;
    }
    if (node.kind === 'in') {
        // Neither builder method encodes a list the way this package needs:
        // `.not()` is generic and just does `${value}`, so a raw array would
        // arrive comma-joined with no parentheses; `.in()` does parenthesize
        // but quotes only on `,()` and never escapes an inner `"`. Build the
        // list literal here so both directions encode identically.
        const list = `(${node.values.map((value) => encodeFilterValue(resolveValue(value, params))).join(',')})`;
        if (node.negated) builder.not(node.column, 'in', list);
        else builder.filter(node.column, 'in', list);
        return builder;
    }
    if (node.kind === 'textSearch') {
        const query = encodeFilterValue(resolveValue(node.value, params));
        const opts: { type?: 'plain' | 'phrase' | 'websearch'; config?: string } = {};
        if (node.type) opts.type = node.type;
        if (node.config) opts.config = node.config;
        if (Object.keys(opts).length) builder.textSearch(node.column, query, opts);
        else builder.textSearch(node.column, query);
        return builder;
    }
    if (node.kind === 'compare') {
        const value = resolveValue(node.value, params);
        // Scalar comparisons go through `.filter()`, same as `.eq()`/`.gt()`/
        // etc. — PostgREST does not strip quotes on a plain `column=op.value`
        // filter (unlike `or()`/`in()`, which need the `"..."` list-literal
        // syntax to delimit values), so quoting one here would send the
        // literal quote characters as part of the value and match nothing.
        // Still reject what a plain string/number/boolean interpolation can't
        // represent: a `Date`'s `toString()`, `undefined`, `[object Object]`,
        // or an array joined with commas would otherwise reach PostgREST
        // looking like a legitimate value instead of failing loudly.
        if (SCALAR_OPERATORS.has(node.operator)) {
            requireScalarOperand(node.operator, value);
            builder.filter(node.column, FILTER_CODES[node.operator], value);
            return builder;
        }
        // The array/range operators take structured operands the builder
        // formats itself, so they keep their dedicated methods — but only for
        // the operand types those methods can actually handle. `.overlaps()`
        // calls `value.join()` on its non-string branch, so a null there threw
        // a TypeError that escaped the driver instead of falling back to SQL.
        requireStructuredOperand(node.operator, value);
        builder[node.operator](node.column, value as never);
        return builder;
    }
    return builder;
}

/** Operators whose operand is a single scalar value. */
const SCALAR_OPERATORS = new Set<CompareOperator>([
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'regexMatch', 'regexIMatch', 'isDistinct',
]);

/** Operators accepting an array or a JSON object as well as a string literal. */
const ARRAY_OR_JSON_OPERATORS = new Set<CompareOperator>(['contains', 'containedBy']);

function requireScalarOperand(operator: CompareOperator, value: unknown): void {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return;
    // `IS DISTINCT FROM NULL` is meaningful SQL and the whole reason
    // `isDistinct` exists instead of plain `eq`/`neq` (which can't compare
    // against NULL at all) — unlike every other scalar operator here, a null
    // operand is a real, intentional filter for it, not a mistranslation.
    if (value === null && operator === 'isDistinct') return;
    throw new UnsupportedSqlError(
        `\`${operator}\` against a value of type ${value === null ? 'null' : typeof value}`,
    );
}

function requireStructuredOperand(operator: CompareOperator, value: unknown): void {
    if (typeof value === 'string') return;
    if (Array.isArray(value) && (operator === 'overlaps' || ARRAY_OR_JSON_OPERATORS.has(operator))) return;
    if (value !== null && typeof value === 'object' && ARRAY_OR_JSON_OPERATORS.has(operator)) return;
    throw new UnsupportedSqlError(
        `\`${operator}\` against a value of type ${value === null ? 'null' : typeof value}`,
    );
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

function serializeChildren(node: Extract<WhereNode, { kind: 'and' | 'or' }>, params: unknown[]): string {
    return node.children.map((child) => serialize(child, params)).join(',');
}

function serialize(node: WhereNode, params: unknown[]): string {
    // Both groups must keep their wrapper. An `or` serialized bare is only
    // correct as the argument of `.or()`; nested anywhere else its disjuncts
    // merge into the enclosing group — `b AND (c OR d)` silently becomes
    // `b AND c AND d`, and `not.` applied to a bare list negates only its
    // first term.
    if (node.kind === 'and' || node.kind === 'or') return `${node.kind}(${serializeChildren(node, params)})`;
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

/**
 * Characters that end a value in PostgREST's filter grammar, plus the
 * backslash that escapes them inside a quoted value.
 */
const NEEDS_QUOTING = /[,.():"\\\s]/;

/** Bare words PostgREST reads as SQL values rather than as text. */
const RESERVED_WORDS = /^(null|true|false|unknown)$/i;

function encodeFilterValue(value: unknown): string {
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (typeof value !== 'string') {
        throw new UnsupportedSqlError(`value of type ${value === null ? 'null' : typeof value} in a filter`);
    }
    // An empty, reserved, or `*`-leading value has to be quoted even though it
    // holds no delimiter: unquoted, PostgREST reads `null` as SQL NULL, `true`
    // as a boolean, and `*` as a wildcard, so the text a caller asked for
    // silently becomes a different filter.
    const mustQuote = value === ''
        || value.startsWith('*')
        || RESERVED_WORDS.test(value)
        || NEEDS_QUOTING.test(value);
    if (!mustQuote) return value;
    // Backslash first: escaping quotes before backslashes would re-escape the
    // backslashes this step adds, and leaving backslashes raw lets a value
    // ending in `\` terminate its own quoting and inject sibling filters.
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
