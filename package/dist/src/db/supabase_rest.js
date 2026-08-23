import config from '../config/intl_config';
import requireDbConfig from './require_config';
import resolveSupabaseEndpoint from './supabase_config';
import resolveAccessToken from './access_token';
function describeQueryFailure(error) {
    return `db: Supabase rejected the request — ${error.message}.`;
}
async function buildClient(supabase, bearerToken) {
    const { url, anonKey } = await resolveSupabaseEndpoint(supabase);
    const { createClient } = await import('@supabase/supabase-js');
    return createClient(url, anonKey, { accessToken: async () => bearerToken });
}
function applyFilters(query, where) {
    let result = query;
    if (!where)
        return result;
    for (const [column, filter] of Object.entries(where)) {
        if (Array.isArray(filter) && filter[0] === 'not') {
            const [, operator, value] = filter;
            result = result.not(column, operator, value);
            continue;
        }
        const [operator, value] = Array.isArray(filter)
            ? [filter[0], filter[1]]
            : ['eq', filter];
        result = result[operator](column, value);
    }
    return result;
}
function applyExtras(query, extras) {
    let result = query;
    if (extras.match)
        result = result.match(extras.match);
    if (extras.or) {
        const or = typeof extras.or === 'string' ? { filters: extras.or, referencedTable: undefined } : extras.or;
        result = result.or(or.filters, { referencedTable: or.referencedTable });
    }
    if (extras.textSearch) {
        result = result.textSearch(extras.textSearch.column, extras.textSearch.query, {
            type: extras.textSearch.type,
            config: extras.textSearch.config,
        });
    }
    return result;
}
function applyOrder(query, orderBy) {
    if (!orderBy)
        return query;
    let result = query;
    for (const clause of Array.isArray(orderBy) ? orderBy : [orderBy]) {
        result = result.order(clause.column, { ascending: clause.ascending, nullsFirst: clause.nullsFirst });
    }
    return result;
}
async function requireSupabaseConfig() {
    const db = config.db;
    requireDbConfig(db);
    if (!db.supabase) {
        throw new Error('db: supabaseSelect/supabaseInsert/supabaseUpsert/supabaseUpdate/supabaseDelete/' +
            'supabaseRpc need `db.supabase` (a project URL and anon key) on your RoutingConfig, ' +
            'even in connection-string mode.');
    }
    return db.supabase;
}
async function anonClient() {
    const supabase = await requireSupabaseConfig();
    const { anonKey } = await resolveSupabaseEndpoint(supabase);
    return buildClient(supabase, anonKey);
}
async function userClient() {
    const supabase = await requireSupabaseConfig();
    const token = await resolveAccessToken(config);
    return buildClient(supabase, token);
}
/**
 * Selects rows from `table` through the Supabase REST API
 * (`@supabase/supabase-js`'s `.from(table).select()`), as the **anonymous**
 * role — no `cfni_exec`, no raw SQL, only what PostgREST's REST API itself
 * supports: a column list, filters (equality or a named operator), one or
 * more `order by` clauses, `limit`/`range` pagination, `single`/`maybeSingle`,
 * and an optional row count.
 *
 * Reach for this — or {@link supabaseSelectAsUser} — instead of
 * `withPublicDb`/`withUserDb` when `db.supabase.rawSql` is `false`, or
 * whenever a query is simple enough that avoiding `cfni_exec` entirely is
 * preferable. Cross-table joins/aggregates spanning more than an embedded
 * resource (`columns: '*, related(*)'`) still need `withPublicDb`/
 * `withUserDb`, or a Postgres function called via {@link supabaseRpc}.
 *
 * @param table Table (or view) name.
 * @param options Column list, filters, ordering, pagination, count.
 * @returns The matching rows, and the total count when `options.count` is set.
 * @throws If `db`/`db.supabase` is not set, or PostgREST rejects the request.
 */
export async function supabaseSelect(table, options = {}) {
    return runSelect(await anonClient(), table, options);
}
/**
 * Same as {@link supabaseSelect}, but authenticated as the **signed-in
 * user**: the bearer token comes from `db.getAccessToken`, or the signed-in
 * Firebase user's ID token when `firebaseAuth` is configured — see
 * {@link resolveAccessToken}. PostgREST resolves the caller as
 * `authenticated` and RLS applies exactly as it would for `withUserDb`.
 */
export async function supabaseSelectAsUser(table, options = {}) {
    return runSelect(await userClient(), table, options);
}
async function runSelect(client, table, options) {
    let query = client.from(table).select(options.columns ?? '*', options.count ? { count: options.count } : undefined);
    query = applyFilters(query, options.where);
    query = applyExtras(query, options);
    query = applyOrder(query, options.orderBy);
    if (options.limit !== undefined)
        query = query.limit(options.limit);
    if (options.range)
        query = query.range(options.range[0], options.range[1]);
    if (options.single)
        query = query.single();
    else if (options.maybeSingle)
        query = query.maybeSingle();
    const { data, error, count } = (await query);
    if (error)
        throw new Error(describeQueryFailure(error));
    const rows = options.single || options.maybeSingle ? (data === null ? [] : [data]) : (data ?? []);
    return { rows, count };
}
/**
 * Inserts one or more rows into `table` through the Supabase REST API, as
 * the **anonymous** role. See {@link supabaseSelect} for when to use this
 * over `withPublicDb`.
 *
 * @param table Table name.
 * @param values A single row, or an array of rows, to insert.
 * @returns The inserted row(s) as returned by PostgREST.
 */
export async function supabaseInsert(table, values) {
    return runInsert(await anonClient(), table, values);
}
/** Same as {@link supabaseInsert}, authenticated as the signed-in user — see {@link supabaseSelectAsUser}. */
export async function supabaseInsertAsUser(table, values) {
    return runInsert(await userClient(), table, values);
}
async function runInsert(client, table, values) {
    const { data, error } = (await client.from(table).insert(values).select());
    if (error)
        throw new Error(describeQueryFailure(error));
    return data ?? [];
}
/**
 * Inserts one or more rows into `table`, or updates them on a conflict —
 * PostgREST's `upsert`, i.e. `insert ... on conflict (...) do update`. As
 * the **anonymous** role.
 *
 * @param table Table name.
 * @param values A single row, or an array of rows, to upsert.
 * @param options `onConflict` (defaults to the table's primary key) and
 * `ignoreDuplicates` (skip instead of update on conflict).
 * @returns The upserted row(s) as returned by PostgREST.
 */
export async function supabaseUpsert(table, values, options = {}) {
    return runUpsert(await anonClient(), table, values, options);
}
/** Same as {@link supabaseUpsert}, authenticated as the signed-in user — see {@link supabaseSelectAsUser}. */
export async function supabaseUpsertAsUser(table, values, options = {}) {
    return runUpsert(await userClient(), table, values, options);
}
async function runUpsert(client, table, values, options) {
    const { data, error } = (await client
        .from(table)
        .upsert(values, { onConflict: options.onConflict, ignoreDuplicates: options.ignoreDuplicates })
        .select());
    if (error)
        throw new Error(describeQueryFailure(error));
    return data ?? [];
}
/**
 * Updates rows in `table` matching `options.where` through the Supabase
 * REST API, as the **anonymous** role. See {@link supabaseSelect} for when
 * to use this over `withPublicDb`.
 *
 * @param table Table name.
 * @param values Columns to set.
 * @param options `where` — filters selecting which rows to update; required,
 * since an unfiltered update would touch every row.
 * @returns The updated rows as returned by PostgREST.
 */
export async function supabaseUpdate(table, values, options) {
    return runUpdate(await anonClient(), table, values, options);
}
/** Same as {@link supabaseUpdate}, authenticated as the signed-in user — see {@link supabaseSelectAsUser}. */
export async function supabaseUpdateAsUser(table, values, options) {
    return runUpdate(await userClient(), table, values, options);
}
async function runUpdate(client, table, values, options) {
    requireMutationFilter(options);
    let query = client.from(table).update(values);
    query = applyFilters(query, options.where);
    query = applyExtras(query, options);
    const { data, error } = (await query.select());
    if (error)
        throw new Error(describeQueryFailure(error));
    return data ?? [];
}
/**
 * Deletes rows in `table` matching `options.where` through the Supabase REST
 * API, as the **anonymous** role. See {@link supabaseSelect} for when to
 * use this over `withPublicDb`.
 *
 * @param table Table name.
 * @param options `where` — filters selecting which rows to delete; required,
 * since an unfiltered delete would remove every row.
 * @returns The deleted rows as returned by PostgREST.
 */
export async function supabaseDelete(table, options) {
    return runDelete(await anonClient(), table, options);
}
/** Same as {@link supabaseDelete}, authenticated as the signed-in user — see {@link supabaseSelectAsUser}. */
export async function supabaseDeleteAsUser(table, options) {
    return runDelete(await userClient(), table, options);
}
async function runDelete(client, table, options) {
    requireMutationFilter(options);
    let query = client.from(table).delete();
    query = applyFilters(query, options.where);
    query = applyExtras(query, options);
    const { data, error } = (await query.select());
    if (error)
        throw new Error(describeQueryFailure(error));
    return data ?? [];
}
/**
 * Calls a Postgres function through PostgREST's `.rpc()` — the same
 * mechanism `cfni_exec` itself uses, but for a function you define yourself.
 * This is how to run anything the `select`/`insert`/`upsert`/`update`/
 * `delete` helpers above can't express (joins, aggregates, custom logic)
 * without needing `cfni_exec`/raw SQL: write a regular Postgres function,
 * `grant execute` to `anon`/`authenticated`, and call it by name.
 *
 * As the **anonymous** role.
 *
 * @param fn Function name.
 * @param args Named arguments, matching the function's parameter names.
 */
export async function supabaseRpc(fn, args) {
    return runRpc(await anonClient(), fn, args);
}
/** Same as {@link supabaseRpc}, authenticated as the signed-in user — see {@link supabaseSelectAsUser}. */
export async function supabaseRpcAsUser(fn, args) {
    return runRpc(await userClient(), fn, args);
}
async function runRpc(client, fn, args) {
    const { data, error } = (await client.rpc(fn, args));
    if (error)
        throw new Error(describeQueryFailure(error));
    return data;
}
function requireMutationFilter(options) {
    const hasWhere = options.where && Object.keys(options.where).length > 0;
    if (!hasWhere && !options.match && !options.or) {
        throw new Error('db: one of `where`/`match`/`or` is required — an unfiltered update/delete would affect every row.');
    }
}
