import tokenizeSql from './sql_tokens';
import parseWhere from './parse_where';
import UnsupportedSqlError from './unsupported_sql';
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
const STATEMENT_CACHE = new Map();
const MAX_STATEMENT_CACHE = 500;
export default function parseStatement(sql) {
    const cached = STATEMENT_CACHE.get(sql);
    if (cached)
        return cached;
    const tokens = tokenizeSql(sql);
    const first = tokens[0];
    if (!first || first.kind !== 'word')
        throw new UnsupportedSqlError('empty statement');
    let parsed;
    if (first.value === 'select')
        parsed = parseSelect(tokens);
    else if (first.value === 'insert')
        parsed = parseInsert(tokens);
    else if (first.value === 'update')
        parsed = parseUpdate(tokens);
    else if (first.value === 'delete')
        parsed = parseDelete(tokens);
    else
        throw new UnsupportedSqlError(`statement type "${first.value}"`);
    if (STATEMENT_CACHE.size >= MAX_STATEMENT_CACHE)
        STATEMENT_CACHE.clear();
    STATEMENT_CACHE.set(sql, parsed);
    return parsed;
}
function parseSelect(tokens) {
    let index = 1;
    if (isWord(tokens[index], 'distinct'))
        throw new UnsupportedSqlError('select distinct');
    const projection = parseProjection(tokens, index);
    index = projection.next;
    if (!isWord(tokens[index], 'from'))
        throw new UnsupportedSqlError('select without a plain `from`');
    index++;
    const table = readIdentifier(tokens, index, 'table name');
    index = table.next;
    if (tokens[index]?.kind === 'quoted' || (tokens[index]?.kind === 'word' && !isClauseKeyword(tokens[index]))) {
        throw new UnsupportedSqlError('table alias');
    }
    if (isPunct(tokens[index], ','))
        throw new UnsupportedSqlError('multiple tables in `from`');
    const select = { kind: 'select', table: table.name, projection: projection.value, orderBy: [] };
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
    requireEnd(tokens, index);
    return select;
}
function parseInsert(tokens) {
    let index = 1;
    if (!isWord(tokens[index], 'into'))
        throw new UnsupportedSqlError('`insert` without `into`');
    index++;
    const table = readIdentifier(tokens, index, 'table name');
    index = table.next;
    if (!isPunct(tokens[index], '('))
        throw new UnsupportedSqlError('`insert` without an explicit column list');
    const columns = readIdentifierList(tokens, index);
    index = columns.next;
    if (!isWord(tokens[index], 'values'))
        throw new UnsupportedSqlError('`insert` without a `values` list');
    index++;
    const rows = [];
    for (;;) {
        if (!isPunct(tokens[index], '('))
            throw new UnsupportedSqlError('malformed `values` list');
        index++;
        const row = [];
        for (;;) {
            const value = readInsertValue(tokens, index);
            row.push(value.value);
            index = value.next;
            if (isPunct(tokens[index], ',')) {
                index++;
                continue;
            }
            break;
        }
        if (!isPunct(tokens[index], ')'))
            throw new UnsupportedSqlError('unterminated `values` row');
        index++;
        rows.push(row);
        if (isPunct(tokens[index], ',')) {
            index++;
            continue;
        }
        break;
    }
    const insert = { kind: 'insert', table: table.name, columns: columns.names, rows };
    if (isWord(tokens[index], 'on')) {
        const parsed = parseOnConflict(tokens, index);
        insert.onConflict = parsed.value;
        index = parsed.next;
    }
    const returning = parseReturning(tokens, index);
    if (returning.value)
        insert.returning = returning.value;
    requireEnd(tokens, returning.next);
    return insert;
}
function parseOnConflict(tokens, start) {
    let index = start + 1;
    if (!isWord(tokens[index], 'conflict'))
        throw new UnsupportedSqlError('`on` without `conflict`');
    index++;
    if (!isPunct(tokens[index], '('))
        throw new UnsupportedSqlError('`on conflict` without a column list');
    const columns = readIdentifierList(tokens, index);
    index = columns.next;
    if (!isWord(tokens[index], 'do'))
        throw new UnsupportedSqlError('`on conflict` without `do`');
    index++;
    if (isWord(tokens[index], 'nothing')) {
        return { value: { columns: columns.names, action: 'nothing' }, next: index + 1 };
    }
    if (!isWord(tokens[index], 'update'))
        throw new UnsupportedSqlError('`on conflict do` action other than nothing/update');
    index++;
    if (!isWord(tokens[index], 'set'))
        throw new UnsupportedSqlError('`do update` without `set`');
    const assignments = readAssignments(tokens, index + 1, true);
    return {
        value: { columns: columns.names, action: 'update', set: assignments.value },
        next: assignments.next,
    };
}
function parseUpdate(tokens) {
    const table = readIdentifier(tokens, 1, 'table name');
    let index = table.next;
    if (!isWord(tokens[index], 'set'))
        throw new UnsupportedSqlError('`update` without a plain `set`');
    const assignments = readAssignments(tokens, index + 1, false);
    index = assignments.next;
    const update = { kind: 'update', table: table.name, set: assignments.value };
    if (isWord(tokens[index], 'where')) {
        const parsed = parseWhere(tokens, index + 1);
        update.where = parsed.node;
        index = parsed.next;
    }
    const returning = parseReturning(tokens, index);
    if (returning.value)
        update.returning = returning.value;
    requireEnd(tokens, returning.next);
    return update;
}
function parseDelete(tokens) {
    if (!isWord(tokens[1], 'from'))
        throw new UnsupportedSqlError('`delete` without `from`');
    const table = readIdentifier(tokens, 2, 'table name');
    let index = table.next;
    const statement = { kind: 'delete', table: table.name };
    if (isWord(tokens[index], 'where')) {
        const parsed = parseWhere(tokens, index + 1);
        statement.where = parsed.node;
        index = parsed.next;
    }
    const returning = parseReturning(tokens, index);
    if (returning.value)
        statement.returning = returning.value;
    requireEnd(tokens, returning.next);
    return statement;
}
function parseReturning(tokens, start) {
    if (!isWord(tokens[start], 'returning'))
        return { value: undefined, next: start };
    if (isPunct(tokens[start + 1], '*'))
        return { value: 'all', next: start + 2 };
    const projection = parseProjection(tokens, start + 1);
    if (projection.value === 'count')
        throw new UnsupportedSqlError('`count(*)` in `returning`');
    return { value: projection.value, next: projection.next };
}
function readAssignments(tokens, start, allowExcluded) {
    const set = {};
    let index = start;
    for (;;) {
        const column = readColumnName(tokens, index);
        index = column.next;
        if (!isPunct(tokens[index], '='))
            throw new UnsupportedSqlError('malformed `set` assignment');
        index++;
        if (allowExcluded && isWord(tokens[index], 'excluded') && isPunct(tokens[index + 1], '.')) {
            const referenced = readColumnName(tokens, index + 2);
            set[column.name] = { kind: 'excluded', column: referenced.name };
            index = referenced.next;
        }
        else {
            const value = readInsertValue(tokens, index);
            set[column.name] = value.value;
            index = value.next;
        }
        if (isPunct(tokens[index], ',')) {
            index++;
            continue;
        }
        break;
    }
    return { value: set, next: index };
}
function readInsertValue(tokens, start) {
    const token = tokens[start];
    if (token?.kind === 'param')
        return { value: { kind: 'param', index: token.index }, next: start + 1 };
    if (token?.kind === 'string')
        return { value: { kind: 'literal', value: token.value }, next: start + 1 };
    if (token?.kind === 'number')
        return { value: { kind: 'literal', value: Number(token.value) }, next: start + 1 };
    if (isPunct(token, '-') && tokens[start + 1]?.kind === 'number') {
        return { value: { kind: 'literal', value: -Number(tokens[start + 1].value) }, next: start + 2 };
    }
    if (token?.kind === 'word' && (token.value === 'true' || token.value === 'false')) {
        return { value: { kind: 'literal', value: token.value === 'true' }, next: start + 1 };
    }
    if (token?.kind === 'word' && token.value === 'null')
        return { value: { kind: 'literal', value: null }, next: start + 1 };
    throw new UnsupportedSqlError(`unsupported value near "${describe(token)}"`);
}
function readColumnName(tokens, start) {
    const token = tokens[start];
    if (!token || (token.kind !== 'quoted' && token.kind !== 'word')) {
        throw new UnsupportedSqlError(`expected a column near "${describe(token)}"`);
    }
    if (isPunct(tokens[start + 1], '.')) {
        const qualified = tokens[start + 2];
        if (!qualified || (qualified.kind !== 'quoted' && qualified.kind !== 'word')) {
            throw new UnsupportedSqlError('expected a column after a table qualifier');
        }
        return { name: qualified.value, next: start + 3 };
    }
    return { name: token.value, next: start + 1 };
}
function readIdentifierList(tokens, start) {
    let index = start + 1;
    const names = [];
    for (;;) {
        const column = readColumnName(tokens, index);
        names.push(column.name);
        index = column.next;
        if (isPunct(tokens[index], ',')) {
            index++;
            continue;
        }
        break;
    }
    if (!isPunct(tokens[index], ')'))
        throw new UnsupportedSqlError('unterminated column list');
    return { names, next: index + 1 };
}
function parseProjection(tokens, start) {
    if (isWord(tokens[start], 'count') && isPunct(tokens[start + 1], '(') && isPunct(tokens[start + 2], '*') && isPunct(tokens[start + 3], ')')) {
        let next = start + 4;
        if (isWord(tokens[next], 'as'))
            next = readIdentifier(tokens, next + 1, 'projection alias').next;
        if (!isWord(tokens[next], 'from'))
            throw new UnsupportedSqlError('`count(*)` combined with other projections');
        return { value: 'count', next };
    }
    if (isPunct(tokens[start], '*') && isWord(tokens[start + 1], 'from'))
        return { value: 'all', next: start + 1 };
    const projections = [];
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
function readProjectionColumn(tokens, start) {
    const token = tokens[start];
    if (!token || (token.kind !== 'quoted' && token.kind !== 'word')) {
        throw new UnsupportedSqlError(`unsupported projection near "${describe(token)}"`);
    }
    if (isPunct(tokens[start + 1], '('))
        throw new UnsupportedSqlError(`expression in projection ("${token.value}")`);
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
function parseOrderBy(tokens, start) {
    if (!isWord(tokens[start + 1], 'by'))
        throw new UnsupportedSqlError('`order` without `by`');
    let index = start + 2;
    const terms = [];
    for (;;) {
        const column = readProjectionColumn(tokens, index);
        if (column.value.alias)
            throw new UnsupportedSqlError('alias in `order by`');
        index = column.next;
        const term = { column: column.value.column, ascending: true };
        if (isWord(tokens[index], 'asc') || isWord(tokens[index], 'desc')) {
            term.ascending = isWord(tokens[index], 'asc');
            index++;
        }
        if (isWord(tokens[index], 'nulls')) {
            if (isWord(tokens[index + 1], 'first'))
                term.nullsFirst = true;
            else if (isWord(tokens[index + 1], 'last'))
                term.nullsFirst = false;
            else
                throw new UnsupportedSqlError('`nulls` without `first`/`last`');
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
function readValueToken(tokens, start) {
    const token = tokens[start];
    if (token?.kind === 'param')
        return { value: { kind: 'param', index: token.index }, next: start + 1 };
    if (token?.kind === 'number')
        return { value: { kind: 'literal', value: Number(token.value) }, next: start + 1 };
    throw new UnsupportedSqlError(`expected a number or placeholder near "${describe(token)}"`);
}
function readIdentifier(tokens, start, what) {
    const token = tokens[start];
    if (!token || (token.kind !== 'quoted' && token.kind !== 'word')) {
        throw new UnsupportedSqlError(`expected a ${what} near "${describe(token)}"`);
    }
    if (isPunct(tokens[start + 1], '.'))
        throw new UnsupportedSqlError(`schema-qualified ${what}`);
    return { name: token.value, next: start + 1 };
}
function requireEnd(tokens, index) {
    if (index < tokens.length)
        throw new UnsupportedSqlError(`trailing clause near "${describe(tokens[index])}"`);
}
const CLAUSE_KEYWORDS = new Set(['where', 'order', 'limit', 'offset', 'returning', 'on']);
function isClauseKeyword(token) {
    return token.kind === 'word' && CLAUSE_KEYWORDS.has(token.value);
}
function isWord(token, value) {
    return token?.kind === 'word' && token.value === value;
}
function isPunct(token, value) {
    return token?.kind === 'punct' && token.value === value;
}
function describe(token) {
    if (!token)
        return 'end of statement';
    return token.kind === 'param' ? `$${token.index}` : token.value;
}
