import type { SqlToken } from './sql_tokens';
import UnsupportedSqlError from './unsupported_sql';

/** A value in a parsed clause: a `$n` placeholder or an inline literal. */
export type SqlValue =
    | { kind: 'param'; index: number }
    | { kind: 'literal'; value: string | number | boolean | null };

/** PostgREST-expressible comparison operators. */
export type CompareOperator =
    | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike'
    | 'regexMatch' | 'regexIMatch'
    | 'contains' | 'containedBy' | 'overlaps'
    | 'rangeGt' | 'rangeGte' | 'rangeLt' | 'rangeLte' | 'rangeAdjacent'
    | 'isDistinct';

/** One node of a parsed `where` tree. */
export type WhereNode =
    | { kind: 'and' | 'or'; children: WhereNode[] }
    | { kind: 'not'; child: WhereNode }
    | { kind: 'compare'; column: string; operator: CompareOperator; value: SqlValue }
    | { kind: 'is'; column: string; negated: boolean }
    | { kind: 'in'; column: string; values: SqlValue[]; negated: boolean }
    | { kind: 'textSearch'; column: string; value: SqlValue; type?: 'plain' | 'phrase' | 'websearch'; config?: string };

/** A parsed `where` tree plus the index the caller should resume from. */
export interface WhereParse {
    node: WhereNode;
    next: number;
}

const OPERATORS: Record<string, CompareOperator> = {
    '=': 'eq',
    '<>': 'neq',
    '!=': 'neq',
    '>': 'gt',
    '>=': 'gte',
    '<': 'lt',
    '<=': 'lte',
    '~': 'regexMatch',
    '~*': 'regexIMatch',
    '@>': 'contains',
    '<@': 'containedBy',
    '&&': 'overlaps',
    '>>': 'rangeGt',
    '<<': 'rangeLt',
    '&>': 'rangeGte',
    '&<': 'rangeLte',
    '-|-': 'rangeAdjacent',
};

const TS_QUERY_TYPES: Record<string, 'plain' | 'phrase' | 'websearch' | undefined> = {
    to_tsquery: undefined,
    plainto_tsquery: 'plain',
    phraseto_tsquery: 'phrase',
    websearch_to_tsquery: 'websearch',
};

const CLAUSE_TERMINATORS = new Set(['order', 'limit', 'offset', 'returning', 'group', 'having', 'window', 'union', 'on']);

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
export default function parseWhere(tokens: SqlToken[], start: number): WhereParse {
    const parsed = parseOr(tokens, start);
    return parsed;
}

function parseOr(tokens: SqlToken[], start: number): WhereParse {
    const children: WhereNode[] = [];
    let index = start;
    for (;;) {
        const parsed = parseAnd(tokens, index);
        children.push(parsed.node);
        index = parsed.next;
        if (!isWord(tokens[index], 'or')) break;
        index++;
    }
    return { node: children.length === 1 ? children[0]! : { kind: 'or', children }, next: index };
}

function parseAnd(tokens: SqlToken[], start: number): WhereParse {
    const children: WhereNode[] = [];
    let index = start;
    for (;;) {
        const parsed = parseUnary(tokens, index);
        children.push(parsed.node);
        index = parsed.next;
        if (!isWord(tokens[index], 'and')) break;
        index++;
    }
    return { node: children.length === 1 ? children[0]! : { kind: 'and', children }, next: index };
}

function parseUnary(tokens: SqlToken[], start: number): WhereParse {
    if (isWord(tokens[start], 'not')) {
        const parsed = parseUnary(tokens, start + 1);
        return { node: { kind: 'not', child: parsed.node }, next: parsed.next };
    }
    if (isPunct(tokens[start], '(')) {
        const parsed = parseOr(tokens, start + 1);
        if (!isPunct(tokens[parsed.next], ')')) throw new UnsupportedSqlError('unbalanced parentheses in where');
        return { node: parsed.node, next: parsed.next + 1 };
    }
    return parseComparison(tokens, start);
}

function parseComparison(tokens: SqlToken[], start: number): WhereParse {
    let index = start;
    const column = readColumn(tokens, index);
    index = column.next;

    const token = tokens[index];
    if (isWord(token, 'is')) {
        index++;
        let negated = false;
        if (isWord(tokens[index], 'not')) {
            negated = true;
            index++;
        }
        if (isWord(tokens[index], 'distinct') && isWord(tokens[index + 1], 'from')) {
            const value = readValue(tokens, index + 2);
            const comp: WhereNode = {
                kind: 'compare',
                column: column.name,
                operator: 'isDistinct',
                value: value.value,
            };
            return {
                node: negated ? { kind: 'not', child: comp } : comp,
                next: value.next,
            };
        }
        if (!isWord(tokens[index], 'null')) throw new UnsupportedSqlError('`is` against a non-null value');
        return { node: { kind: 'is', column: column.name, negated }, next: index + 1 };
    }

    let notIn = false;
    if (isWord(token, 'not') && isWord(tokens[index + 1], 'in')) {
        notIn = true;
        index += 2;
    } else if (isWord(token, 'in')) {
        index++;
    }
    if (notIn || isWord(token, 'in')) {
        if (!isPunct(tokens[index], '(')) throw new UnsupportedSqlError('`in` without a value list');
        index++;
        const values: SqlValue[] = [];
        for (;;) {
            const value = readValue(tokens, index);
            values.push(value.value);
            index = value.next;
            if (isPunct(tokens[index], ',')) {
                index++;
                continue;
            }
            break;
        }
        if (!isPunct(tokens[index], ')')) throw new UnsupportedSqlError('unterminated `in` value list');
        return { node: { kind: 'in', column: column.name, values, negated: notIn }, next: index + 1 };
    }

    if (isPunct(token, '@@')) {
        const call = tokens[index + 1];
        if (call?.kind !== 'word' || !(call.value in TS_QUERY_TYPES)) {
            throw new UnsupportedSqlError(`full-text search via "${describe(call)}"`);
        }
        if (!isPunct(tokens[index + 2], '(')) throw new UnsupportedSqlError('malformed text-search call');
        let cursor = index + 3;
        let config: string | undefined;
        const first = readValue(tokens, cursor);
        cursor = first.next;
        let query = first.value;
        if (isPunct(tokens[cursor], ',')) {
            if (first.value.kind !== 'literal' || typeof first.value.value !== 'string') {
                throw new UnsupportedSqlError('non-literal text-search configuration');
            }
            config = first.value.value;
            const second = readValue(tokens, cursor + 1);
            query = second.value;
            cursor = second.next;
        }
        if (!isPunct(tokens[cursor], ')')) throw new UnsupportedSqlError('unterminated text-search call');
        const node: WhereNode = { kind: 'textSearch', column: column.name, value: query };
        const type = TS_QUERY_TYPES[call.value];
        if (type) node.type = type;
        if (config) node.config = config;
        return { node, next: cursor + 1 };
    }

    if (isWord(token, 'like') || isWord(token, 'ilike')) {
        const operator = (token as { value: string }).value as 'like' | 'ilike';
        const value = readValue(tokens, index + 1);
        return { node: { kind: 'compare', column: column.name, operator, value: value.value }, next: value.next };
    }

    if (token?.kind === 'punct' && OPERATORS[token.value]) {
        const value = readValue(tokens, index + 1);
        return {
            node: { kind: 'compare', column: column.name, operator: OPERATORS[token.value]!, value: value.value },
            next: value.next,
        };
    }

    throw new UnsupportedSqlError(`unsupported operator in where near "${describe(token)}"`);
}

function readColumn(tokens: SqlToken[], start: number): { name: string; next: number } {
    const token = tokens[start];
    if (!token || (token.kind !== 'quoted' && token.kind !== 'word')) {
        throw new UnsupportedSqlError(`expected a column in where near "${describe(token)}"`);
    }
    if (token.kind === 'word' && CLAUSE_TERMINATORS.has(token.value)) {
        throw new UnsupportedSqlError(`expected a column in where near "${token.value}"`);
    }
    if (isPunct(tokens[start + 1], '(')) throw new UnsupportedSqlError(`function call in where ("${token.value}")`);
    if (isPunct(tokens[start + 1], '.')) {
        const column = tokens[start + 2];
        if (!column || (column.kind !== 'quoted' && column.kind !== 'word')) {
            throw new UnsupportedSqlError('expected a column after a table qualifier in where');
        }
        return { name: column.value, next: start + 3 };
    }
    return { name: token.value, next: start + 1 };
}

function readValue(tokens: SqlToken[], start: number): { value: SqlValue; next: number } {
    const token = tokens[start];
    if (!token) throw new UnsupportedSqlError('missing value in where');
    if (token.kind === 'param') return { value: { kind: 'param', index: token.index }, next: start + 1 };
    if (token.kind === 'string') return { value: { kind: 'literal', value: token.value }, next: start + 1 };
    if (token.kind === 'number') return { value: { kind: 'literal', value: Number(token.value) }, next: start + 1 };
    if (isPunct(token, '-') && tokens[start + 1]?.kind === 'number') {
        return { value: { kind: 'literal', value: -Number((tokens[start + 1] as { value: string }).value) }, next: start + 2 };
    }
    if (token.kind === 'word' && (token.value === 'true' || token.value === 'false')) {
        return { value: { kind: 'literal', value: token.value === 'true' }, next: start + 1 };
    }
    if (token.kind === 'word' && token.value === 'null') return { value: { kind: 'literal', value: null }, next: start + 1 };
    throw new UnsupportedSqlError(`unsupported value in where near "${describe(token)}"`);
}

function isWord(token: SqlToken | undefined, value: string): boolean {
    return token?.kind === 'word' && token.value === value;
}

function isPunct(token: SqlToken | undefined, value: string): boolean {
    return token?.kind === 'punct' && token.value === value;
}

function describe(token: SqlToken | undefined): string {
    if (!token) return 'end of statement';
    return token.kind === 'param' ? `$${token.index}` : token.value;
}
