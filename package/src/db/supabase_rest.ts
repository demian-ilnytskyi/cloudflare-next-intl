import type { SupabaseDbConfig } from '../types/types';
import config from '../config/intl_config';
import requireDbConfig from './require_config';
import resolveSupabaseEndpoint from './supabase_config';
import resolveAccessToken from './access_token';

interface SupabaseQueryError {
    message: string;
    code?: string;
}

interface SupabaseQueryResult<T> {
    data: T | null;
    error: SupabaseQueryError | null;
    count: number | null;
}

/**
 * The subset of PostgREST filter/transform operators exposed by
 * `@supabase/postgrest-js` that this module forwards to. Structurally typed
 * so this file never imports `@supabase/supabase-js` for types.
 */
interface SupabaseQueryBuilder {
    select: (columns?: string, opts?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }) => SupabaseQueryBuilder;
    insert: (values: Record<string, unknown> | Record<string, unknown>[]) => SupabaseQueryBuilder;
    upsert: (
        values: Record<string, unknown> | Record<string, unknown>[],
        opts?: { onConflict?: string; ignoreDuplicates?: boolean },
    ) => SupabaseQueryBuilder;
    update: (values: Record<string, unknown>) => SupabaseQueryBuilder;
    delete: () => SupabaseQueryBuilder;
    eq: (column: string, value: unknown) => SupabaseQueryBuilder;
    neq: (column: string, value: unknown) => SupabaseQueryBuilder;
    gt: (column: string, value: unknown) => SupabaseQueryBuilder;
    gte: (column: string, value: unknown) => SupabaseQueryBuilder;
    lt: (column: string, value: unknown) => SupabaseQueryBuilder;
    lte: (column: string, value: unknown) => SupabaseQueryBuilder;
    like: (column: string, pattern: string) => SupabaseQueryBuilder;
    likeAllOf: (column: string, patterns: readonly string[]) => SupabaseQueryBuilder;
    likeAnyOf: (column: string, patterns: readonly string[]) => SupabaseQueryBuilder;
    ilike: (column: string, pattern: string) => SupabaseQueryBuilder;
    ilikeAllOf: (column: string, patterns: readonly string[]) => SupabaseQueryBuilder;
    ilikeAnyOf: (column: string, patterns: readonly string[]) => SupabaseQueryBuilder;
    regexMatch: (column: string, pattern: string) => SupabaseQueryBuilder;
    regexIMatch: (column: string, pattern: string) => SupabaseQueryBuilder;
    is: (column: string, value: boolean | null) => SupabaseQueryBuilder;
    isDistinct: (column: string, value: unknown) => SupabaseQueryBuilder;
    in: (column: string, values: readonly unknown[]) => SupabaseQueryBuilder;
    contains: (column: string, value: unknown) => SupabaseQueryBuilder;
    containedBy: (column: string, value: unknown) => SupabaseQueryBuilder;
    overlaps: (column: string, value: unknown) => SupabaseQueryBuilder;
    rangeGt: (column: string, range: string) => SupabaseQueryBuilder;
    rangeGte: (column: string, range: string) => SupabaseQueryBuilder;
    rangeLt: (column: string, range: string) => SupabaseQueryBuilder;
    rangeLte: (column: string, range: string) => SupabaseQueryBuilder;
    rangeAdjacent: (column: string, range: string) => SupabaseQueryBuilder;
    textSearch: (column: string, query: string, opts?: { type?: 'plain' | 'phrase' | 'websearch'; config?: string }) => SupabaseQueryBuilder;
    match: (query: Record<string, unknown>) => SupabaseQueryBuilder;
    not: (column: string, operator: string, value: unknown) => SupabaseQueryBuilder;
    or: (filters: string, opts?: { referencedTable?: string }) => SupabaseQueryBuilder;
    filter: (column: string, operator: string, value: unknown) => SupabaseQueryBuilder;
    order: (column: string, opts?: { ascending?: boolean; nullsFirst?: boolean; referencedTable?: string }) => SupabaseQueryBuilder;
    limit: (count: number, opts?: { referencedTable?: string }) => SupabaseQueryBuilder;
    range: (from: number, to: number, opts?: { referencedTable?: string }) => SupabaseQueryBuilder;
    single: () => SupabaseQueryBuilder;
    maybeSingle: () => SupabaseQueryBuilder;
    csv: () => Promise<{ data: string | null; error: SupabaseQueryError | null }>;
    then: <T>(onfulfilled?: (value: SupabaseQueryResult<T>) => unknown) => Promise<unknown>;
}

interface SupabaseRestClient {
    from: (table: string) => SupabaseQueryBuilder;
    rpc: (fn: string, args?: Record<string, unknown>) => Promise<SupabaseQueryResult<unknown>>;
}

/**
 * One filter's operator and value, e.g. `{ age: ['gt', 18] }`. The bare-value
 * form `{ id: 5 }` (see {@link SupabaseWhere}) is shorthand for `['eq', 5]`.
 * `['not', operator, value]` negates any operator (`['not', 'eq', 5]` is
 * `column <> 5` via PostgREST's `not.eq.5`).
 *
 * This is the complete operator set `@supabase/supabase-js`'s query builder
 * exposes for `.from(table)` — there's no separate "Supabase client" query
 * layer on top of `postgrest-js`; `supabase.from()` returns a `postgrest-js`
 * builder directly, so this list is also the ceiling for what `supabase-js`
 * itself can express against a single table. What's still out of reach:
 * joins/embedded resources (pass a nested `columns` string instead — that's
 * plain PostgREST syntax, not a filter), and anything needing more than one
 * table in a single round-trip. Those need `cfni_exec`/`withPublicDb`/
 * `withUserDb`, or a Postgres function called via {@link supabaseRpc}.
 */
export type SupabaseFilterOperator =
    | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
    | 'like' | 'likeAllOf' | 'likeAnyOf'
    | 'ilike' | 'ilikeAllOf' | 'ilikeAnyOf'
    | 'regexMatch' | 'regexIMatch'
    | 'is' | 'isDistinct' | 'in'
    | 'contains' | 'containedBy' | 'overlaps'
    | 'rangeGt' | 'rangeGte' | 'rangeLt' | 'rangeLte' | 'rangeAdjacent';

export type SupabaseFilterValue =
    | unknown
    | [SupabaseFilterOperator, unknown]
    | ['not', SupabaseFilterOperator, unknown];

/** Equality (or `[operator, value]`) filters, ANDed together column by column. */
export type SupabaseWhere = Record<string, SupabaseFilterValue>;

export interface SupabaseTextSearch {
    column: string;
    query: string;
    type?: 'plain' | 'phrase' | 'websearch';
    config?: string;
}

export interface SupabaseOrderBy {
    column: string;
    ascending?: boolean;
    nullsFirst?: boolean;
}

export interface SupabaseSelectOptions {
    /** Column list, PostgREST syntax (e.g. `'id,name'`, or `'*, related(*)'` for an embedded resource). Defaults to `'*'`. */
    columns?: string;
    /** Filters, ANDed together — see {@link SupabaseWhere}. */
    where?: SupabaseWhere;
    /** Shorthand for several `eq` filters at once — PostgREST's `.match()`. ANDed with `where`. */
    match?: Record<string, unknown>;
    /** A raw PostgREST `or()` filter string (e.g. `'age.gt.18,status.eq.active'`), for filters spanning multiple columns. ANDed with `where`/`match`. */
    or?: string | { filters: string; referencedTable?: string };
    /** Full-text search via PostgREST's `@@` operators. */
    textSearch?: SupabaseTextSearch;
    /** One or more `order by` clauses, applied in array order. */
    orderBy?: SupabaseOrderBy | SupabaseOrderBy[];
    /** Maximum rows to return. */
    limit?: number;
    /** Zero-indexed, inclusive `[from, to]` row range — PostgREST pagination. */
    range?: [number, number];
    /** Resolve to the single matching row instead of an array; errors if there isn't exactly one. */
    single?: boolean;
    /** Resolve to the single matching row, or `null` if there are none; errors if there's more than one. */
    maybeSingle?: boolean;
    /** Also return the total matching row count (`'exact'`, `'planned'`, or `'estimated'`). */
    count?: 'exact' | 'planned' | 'estimated';
}

export interface SupabaseMutationOptions {
    /** Filters, ANDed together — see {@link SupabaseWhere}. At least one of `where`/`match`/`or` is required for update/delete. */
    where?: SupabaseWhere;
    /** Shorthand for several `eq` filters at once. ANDed with `where`. */
    match?: Record<string, unknown>;
    /** A raw PostgREST `or()` filter string, for filters spanning multiple columns. ANDed with `where`/`match`. */
    or?: string | { filters: string; referencedTable?: string };
}

export interface SupabaseUpsertOptions {
    /** Column(s) forming the conflict target, comma-separated. Defaults to the table's primary key. */
    onConflict?: string;
    /** Skip (rather than update) rows that already exist. Defaults to `false`. */
    ignoreDuplicates?: boolean;
}

export interface SupabaseResult<T> {
    rows: T[];
    /** Present only when `count` was requested on a select. */
    count: number | null;
}

function describeQueryFailure(error: SupabaseQueryError): string {
    return `db: Supabase rejected the request — ${error.message}.`;
}

async function buildClient(supabase: SupabaseDbConfig, bearerToken: string): Promise<SupabaseRestClient> {
    const { url, anonKey } = await resolveSupabaseEndpoint(supabase);
    const { createClient } = await import('@supabase/supabase-js');
    return createClient(url, anonKey, { accessToken: async () => bearerToken }) as unknown as SupabaseRestClient;
}

function applyFilters(query: SupabaseQueryBuilder, where?: SupabaseWhere): SupabaseQueryBuilder {
    let result = query;
    if (!where) return result;
    for (const [column, filter] of Object.entries(where)) {
        if (Array.isArray(filter) && filter[0] === 'not') {
            const [, operator, value] = filter as ['not', SupabaseFilterOperator, unknown];
            result = result.not(column, operator, value as never);
            continue;
        }
        const [operator, value]: [SupabaseFilterOperator, unknown] = Array.isArray(filter)
            ? [filter[0] as SupabaseFilterOperator, filter[1]]
            : ['eq', filter];
        result = result[operator](column, value as never);
    }
    return result;
}

function applyExtras(
    query: SupabaseQueryBuilder,
    extras: { match?: Record<string, unknown>; or?: string | { filters: string; referencedTable?: string }; textSearch?: SupabaseTextSearch },
): SupabaseQueryBuilder {
    let result = query;
    if (extras.match) result = result.match(extras.match);
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

function applyOrder(query: SupabaseQueryBuilder, orderBy?: SupabaseOrderBy | SupabaseOrderBy[]): SupabaseQueryBuilder {
    if (!orderBy) return query;
    let result = query;
    for (const clause of Array.isArray(orderBy) ? orderBy : [orderBy]) {
        result = result.order(clause.column, { ascending: clause.ascending, nullsFirst: clause.nullsFirst });
    }
    return result;
}

async function requireSupabaseConfig(): Promise<SupabaseDbConfig> {
    const db = config.db;
    requireDbConfig(db);
    if (!db.supabase) {
        throw new Error(
            'db: supabaseSelect/supabaseInsert/supabaseUpsert/supabaseUpdate/supabaseDelete/' +
            'supabaseRpc need `db.supabase` (a project URL and anon key) on your RoutingConfig, ' +
            'even in connection-string mode.',
        );
    }
    return db.supabase;
}

async function anonClient(): Promise<SupabaseRestClient> {
    const supabase = await requireSupabaseConfig();
    const { anonKey } = await resolveSupabaseEndpoint(supabase);
    return buildClient(supabase, anonKey);
}

async function userClient(): Promise<SupabaseRestClient> {
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
export async function supabaseSelect<T = Record<string, unknown>>(
    table: string,
    options: SupabaseSelectOptions = {},
): Promise<SupabaseResult<T>> {
    return runSelect<T>(await anonClient(), table, options);
}

/**
 * Same as {@link supabaseSelect}, but authenticated as the **signed-in
 * user**: the bearer token comes from `db.getAccessToken`, or the signed-in
 * Firebase user's ID token when `firebaseAuth` is configured — see
 * {@link resolveAccessToken}. PostgREST resolves the caller as
 * `authenticated` and RLS applies exactly as it would for `withUserDb`.
 */
export async function supabaseSelectAsUser<T = Record<string, unknown>>(
    table: string,
    options: SupabaseSelectOptions = {},
): Promise<SupabaseResult<T>> {
    return runSelect<T>(await userClient(), table, options);
}

async function runSelect<T>(client: SupabaseRestClient, table: string, options: SupabaseSelectOptions): Promise<SupabaseResult<T>> {
    let query = client.from(table).select(options.columns ?? '*', options.count ? { count: options.count } : undefined);
    query = applyFilters(query, options.where);
    query = applyExtras(query, options);
    query = applyOrder(query, options.orderBy);
    if (options.limit !== undefined) query = query.limit(options.limit);
    if (options.range) query = query.range(options.range[0], options.range[1]);
    if (options.single) query = query.single();
    else if (options.maybeSingle) query = query.maybeSingle();

    const { data, error, count } = (await query) as SupabaseQueryResult<T | T[]>;
    if (error) throw new Error(describeQueryFailure(error));
    const rows = options.single || options.maybeSingle ? (data === null ? [] : [data as T]) : ((data as T[]) ?? []);
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
export async function supabaseInsert<T = Record<string, unknown>>(
    table: string,
    values: Record<string, unknown> | Record<string, unknown>[],
): Promise<T[]> {
    return runInsert<T>(await anonClient(), table, values);
}

/** Same as {@link supabaseInsert}, authenticated as the signed-in user — see {@link supabaseSelectAsUser}. */
export async function supabaseInsertAsUser<T = Record<string, unknown>>(
    table: string,
    values: Record<string, unknown> | Record<string, unknown>[],
): Promise<T[]> {
    return runInsert<T>(await userClient(), table, values);
}

async function runInsert<T>(
    client: SupabaseRestClient,
    table: string,
    values: Record<string, unknown> | Record<string, unknown>[],
): Promise<T[]> {
    const { data, error } = (await client.from(table).insert(values).select()) as SupabaseQueryResult<T[]>;
    if (error) throw new Error(describeQueryFailure(error));
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
export async function supabaseUpsert<T = Record<string, unknown>>(
    table: string,
    values: Record<string, unknown> | Record<string, unknown>[],
    options: SupabaseUpsertOptions = {},
): Promise<T[]> {
    return runUpsert<T>(await anonClient(), table, values, options);
}

/** Same as {@link supabaseUpsert}, authenticated as the signed-in user — see {@link supabaseSelectAsUser}. */
export async function supabaseUpsertAsUser<T = Record<string, unknown>>(
    table: string,
    values: Record<string, unknown> | Record<string, unknown>[],
    options: SupabaseUpsertOptions = {},
): Promise<T[]> {
    return runUpsert<T>(await userClient(), table, values, options);
}

async function runUpsert<T>(
    client: SupabaseRestClient,
    table: string,
    values: Record<string, unknown> | Record<string, unknown>[],
    options: SupabaseUpsertOptions,
): Promise<T[]> {
    const { data, error } = (await client
        .from(table)
        .upsert(values, { onConflict: options.onConflict, ignoreDuplicates: options.ignoreDuplicates })
        .select()) as SupabaseQueryResult<T[]>;
    if (error) throw new Error(describeQueryFailure(error));
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
export async function supabaseUpdate<T = Record<string, unknown>>(
    table: string,
    values: Record<string, unknown>,
    options: SupabaseMutationOptions,
): Promise<T[]> {
    return runUpdate<T>(await anonClient(), table, values, options);
}

/** Same as {@link supabaseUpdate}, authenticated as the signed-in user — see {@link supabaseSelectAsUser}. */
export async function supabaseUpdateAsUser<T = Record<string, unknown>>(
    table: string,
    values: Record<string, unknown>,
    options: SupabaseMutationOptions,
): Promise<T[]> {
    return runUpdate<T>(await userClient(), table, values, options);
}

async function runUpdate<T>(
    client: SupabaseRestClient,
    table: string,
    values: Record<string, unknown>,
    options: SupabaseMutationOptions,
): Promise<T[]> {
    requireMutationFilter(options);
    let query = client.from(table).update(values);
    query = applyFilters(query, options.where);
    query = applyExtras(query, options);
    const { data, error } = (await query.select()) as SupabaseQueryResult<T[]>;
    if (error) throw new Error(describeQueryFailure(error));
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
export async function supabaseDelete<T = Record<string, unknown>>(
    table: string,
    options: SupabaseMutationOptions,
): Promise<T[]> {
    return runDelete<T>(await anonClient(), table, options);
}

/** Same as {@link supabaseDelete}, authenticated as the signed-in user — see {@link supabaseSelectAsUser}. */
export async function supabaseDeleteAsUser<T = Record<string, unknown>>(
    table: string,
    options: SupabaseMutationOptions,
): Promise<T[]> {
    return runDelete<T>(await userClient(), table, options);
}

async function runDelete<T>(client: SupabaseRestClient, table: string, options: SupabaseMutationOptions): Promise<T[]> {
    requireMutationFilter(options);
    let query = client.from(table).delete();
    query = applyFilters(query, options.where);
    query = applyExtras(query, options);
    const { data, error } = (await query.select()) as SupabaseQueryResult<T[]>;
    if (error) throw new Error(describeQueryFailure(error));
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
export async function supabaseRpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T> {
    return runRpc<T>(await anonClient(), fn, args);
}

/** Same as {@link supabaseRpc}, authenticated as the signed-in user — see {@link supabaseSelectAsUser}. */
export async function supabaseRpcAsUser<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T> {
    return runRpc<T>(await userClient(), fn, args);
}

async function runRpc<T>(client: SupabaseRestClient, fn: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = (await client.rpc(fn, args)) as SupabaseQueryResult<T>;
    if (error) throw new Error(describeQueryFailure(error));
    return data as T;
}

function requireMutationFilter(options: SupabaseMutationOptions): void {
    const hasWhere = options.where && Object.keys(options.where).length > 0;
    if (!hasWhere && !options.match && !options.or) {
        throw new Error(
            'db: one of `where`/`match`/`or` is required — an unfiltered update/delete would affect every row.',
        );
    }
}
