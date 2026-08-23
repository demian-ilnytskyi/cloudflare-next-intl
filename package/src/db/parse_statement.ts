import tokenizeSql, { type SqlToken } from './sql_tokens';
import parseWhere, { type SqlValue, type WhereNode } from './parse_where';
import UnsupportedSqlError from './unsupported_sql';

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
    projection: Projection[] | 'all';
    where?: WhereNode;
    orderBy: OrderBy[];
    limit?: SqlValue;
    offset?: SqlValue;
}

/** Any statement the REST executor knows how to run. */
export type ParsedStatement = ParsedSelect;

/**
 * Parses a generated statement into the smallest description the REST
 * executor needs, rejecting anything PostgREST's single-table API cannot do.
 *
 * The parser is deliberately strict: a statement it does not fully understand
 * must raise rather than translate approximately, because the transport reads
 * a raise as "send this to `cfni_exec` instead" and a wrong translation would
 * silently return wrong rows.
 *
 * @param sql The generated statement text, `$n` placeholders included.
 * @returns The parsed statement.
 * @throws {UnsupportedSqlError} If the statement is outside the supported subset.
 */
export default function parseStatement(sql: string): ParsedStatement {
    const tokens = tokenizeSql(sql);
    const first = tokens[0];
    if (!first || first.kind !== 'word') throw new UnsupportedSqlError('empty statement');
    if (first.value === 'select') return parseSelect(tokens);
    throw new UnsupportedSqlError(`statement type "${first.value}"`);
}

function parseSelect(tokens: SqlToken[]): ParsedSelect {
    let index = 1;
    if (isWord(tokens[index], 'distinct')) throw new UnsupportedSqlError('select distinct');

    const projection = parseProjection(tokens, index);
    index = projection.next;

    if (!isWord(tokens[index], 'from')) throw new UnsupportedSqlError('select without a plain `from`');
    index++;

    const table = readIdentifier(tokens, index, 'table name');
    index = table.next;
    if (tokens[index]?.kind === 'quoted' || (tokens[index]?.kind === 'word' && !isClauseKeyword(tokens[index]!))) {
        throw new UnsupportedSqlError('table alias');
    }
    if (isPunct(tokens[index], ',')) throw new UnsupportedSqlError('multiple tables in `from`');

    const select: ParsedSelect = { kind: 'select', table: table.name, projection: projection.value, orderBy: [] };

    if (isWord(tokens[index], 'where')) {
        const parsed = parseWhere(tokens, index + 1);
        select.where = parsed.node;
        index = parsed.next;
    }

    if (isWord(tokens[index], 'order')) {
        const parsed = parseOrderBy(tokens, index);
        select.orderBy = parsed.value;
        index = parsed.next;
    }

    if (isWord(tokens[index], 'limit')) {
        const value = readValueToken(tokens, index + 1);
        select.limit = value.value;
        index = value.next;
    }

    if (isWord(tokens[index], 'offset')) {
        const value = readValueToken(tokens, index + 1);
        select.offset = value.value;
        index = value.next;
    }

    if (index < tokens.length) throw new UnsupportedSqlError(`trailing clause near "${describe(tokens[index])}"`);
    return select;
}

function parseProjection(tokens: SqlToken[], start: number): { value: Projection[] | 'all'; next: number } {
    if (isPunct(tokens[start], '*') && isWord(tokens[start + 1], 'from')) return { value: 'all', next: start + 1 };

    const projections: Projection[] = [];
    let index = start;
    for (;;) {
        const column = readProjectionColumn(tokens, index);
        projections.push(column.value);
        index = column.next;
        if (isPunct(tokens[index], ',')) {
            index++;
            continue;
        }
        break;
    }
    return { value: projections, next: index };
}

function readProjectionColumn(tokens: SqlToken[], start: number): { value: Projection; next: number } {
    const token = tokens[start];
    if (!token || (token.kind !== 'quoted' && token.kind !== 'word')) {
        throw new UnsupportedSqlError(`unsupported projection near "${describe(token)}"`);
    }
    if (isPunct(tokens[start + 1], '(')) throw new UnsupportedSqlError(`expression in projection ("${token.value}")`);

    let index = start + 1;
    let column = token.value;
    if (isPunct(tokens[index], '.')) {
        const qualified = tokens[index + 1];
        if (!qualified || (qualified.kind !== 'quoted' && qualified.kind !== 'word')) {
            throw new UnsupportedSqlError('unsupported qualified projection');
        }
        column = qualified.value;
        index += 2;
    }

    if (isWord(tokens[index], 'as')) {
        const alias = readIdentifier(tokens, index + 1, 'projection alias');
        return { value: { column, alias: alias.name }, next: alias.next };
    }
    return { value: { column }, next: index };
}

function parseOrderBy(tokens: SqlToken[], start: number): { value: OrderBy[]; next: number } {
    if (!isWord(tokens[start + 1], 'by')) throw new UnsupportedSqlError('`order` without `by`');
    let index = start + 2;
    const terms: OrderBy[] = [];
    for (;;) {
        const column = readProjectionColumn(tokens, index);
        if (column.value.alias) throw new UnsupportedSqlError('alias in `order by`');
        index = column.next;
        const term: OrderBy = { column: column.value.column, ascending: true };
        if (isWord(tokens[index], 'asc') || isWord(tokens[index], 'desc')) {
            term.ascending = isWord(tokens[index], 'asc');
            index++;
        }
        if (isWord(tokens[index], 'nulls')) {
            if (isWord(tokens[index + 1], 'first')) term.nullsFirst = true;
            else if (isWord(tokens[index + 1], 'last')) term.nullsFirst = false;
            else throw new UnsupportedSqlError('`nulls` without `first`/`last`');
            index += 2;
        }
        terms.push(term);
        if (isPunct(tokens[index], ',')) {
            index++;
            continue;
        }
        break;
    }
    return { value: terms, next: index };
}

function readValueToken(tokens: SqlToken[], start: number): { value: SqlValue; next: number } {
    const token = tokens[start];
    if (token?.kind === 'param') return { value: { kind: 'param', index: token.index }, next: start + 1 };
    if (token?.kind === 'number') return { value: { kind: 'literal', value: Number(token.value) }, next: start + 1 };
    throw new UnsupportedSqlError(`expected a number or placeholder near "${describe(token)}"`);
}

function readIdentifier(tokens: SqlToken[], start: number, what: string): { name: string; next: number } {
    const token = tokens[start];
    if (!token || (token.kind !== 'quoted' && token.kind !== 'word')) {
        throw new UnsupportedSqlError(`expected a ${what} near "${describe(token)}"`);
    }
    if (isPunct(tokens[start + 1], '.')) throw new UnsupportedSqlError(`schema-qualified ${what}`);
    return { name: token.value, next: start + 1 };
}

const CLAUSE_KEYWORDS = new Set(['where', 'order', 'limit', 'offset', 'returning', 'on']);

function isClauseKeyword(token: SqlToken): boolean {
    return token.kind === 'word' && CLAUSE_KEYWORDS.has(token.value);
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
