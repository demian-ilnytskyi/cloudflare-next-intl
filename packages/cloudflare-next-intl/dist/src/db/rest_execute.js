import applyWhere, { resolveValue } from './rest_filters.js';
import UnsupportedSqlError from './unsupported_sql.js';
export default async function executeRest(client, statement, params) {
    const table = client.from(statement.table);
    let builder;
    if (statement.kind === 'select' && statement.projection === 'count') {
        builder = table.select('', { count: 'exact', head: true });
        if (statement.where)
            applyWhere(builder, statement.where, params);
        const { error, count } = await builder;
        if (error)
            throw new Error(`db: Supabase rejected the query — ${error.message}.`);
        return { rows: [[count]], rowCount: 1 };
    }
    const projection = statement.kind === 'select' ? statement.projection : statement.returning;
    if (statement.kind === 'select') {
        builder = table.select(columnList(statement.projection));
        if (statement.where)
            applyWhere(builder, statement.where, params);
        for (const term of statement.orderBy) {
            builder = builder.order(term.column, { ascending: term.ascending, nullsFirst: term.nullsFirst });
        }
        applyRange(builder, statement, params);
    }
    else if (statement.kind === 'insert') {
        const values = statement.rows.map((row) => Object.fromEntries(statement.columns.map((column, index) => [column, resolveValue(row[index], params)])));
        builder = statement.onConflict
            ? table.upsert(values, {
                onConflict: statement.onConflict.columns.join(','),
                ignoreDuplicates: statement.onConflict.action === 'nothing',
            })
            : table.insert(values);
        if (statement.onConflict?.action === 'update')
            requirePlainUpsert(statement.onConflict.set);
        builder = withProjection(builder, projection);
    }
    else if (statement.kind === 'update') {
        const values = Object.fromEntries(Object.entries(statement.set).map(([column, value]) => [column, resolveValue(value, params)]));
        builder = table.update(values);
        builder = withProjection(builder, projection);
        if (statement.where)
            applyWhere(builder, statement.where, params);
    }
    else {
        builder = table.delete();
        builder = withProjection(builder, projection);
        if (statement.where)
            applyWhere(builder, statement.where, params);
    }
    const { data, error, count } = await builder;
    if (error)
        throw new Error(`db: Supabase rejected the query — ${error.message}.`);
    if (!projection)
        return { rows: [], rowCount: count };
    const rows = (data ?? []).map((row) => projectionOf(projection).map(({ column, alias }) => {
        const val = (alias ? row[alias] : undefined) ?? row[column];
        return val ?? null;
    }));
    return { rows, rowCount: rows.length };
}
function withProjection(builder, projection) {
    if (!projection)
        return builder.select('', { count: 'exact', head: true });
    return builder.select(columnList(projection));
}
function applyRange(builder, statement, params) {
    const limit = statement.limit === undefined ? undefined : Number(resolveValue(statement.limit, params));
    const offset = statement.offset === undefined ? undefined : Number(resolveValue(statement.offset, params));
    if (offset !== undefined && limit !== undefined)
        builder.range(offset, offset + limit - 1);
    else if (limit !== undefined)
        builder.limit(limit);
    else if (offset !== undefined)
        builder.range(offset, Number.MAX_SAFE_INTEGER);
}
function requirePlainUpsert(set) {
    for (const value of Object.values(set)) {
        if (!value || typeof value !== 'object' || value.kind !== 'excluded') {
            throw new UnsupportedSqlError('`on conflict do update set` with a value other than `excluded.<column>`');
        }
    }
}
function projectionOf(projection) {
    if (projection === 'all')
        throw new UnsupportedSqlError('`*` projection over the REST API');
    if (projection === 'count')
        throw new UnsupportedSqlError('`count(*)` in `returning`');
    return projection;
}
function columnList(projection) {
    return projectionOf(projection)
        .map(({ column, alias }) => (alias ? `${alias}:${column}` : column))
        .join(',');
}
