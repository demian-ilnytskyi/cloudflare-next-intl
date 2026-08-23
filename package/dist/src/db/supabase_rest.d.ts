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
export type SupabaseFilterOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'likeAllOf' | 'likeAnyOf' | 'ilike' | 'ilikeAllOf' | 'ilikeAnyOf' | 'regexMatch' | 'regexIMatch' | 'is' | 'isDistinct' | 'in' | 'contains' | 'containedBy' | 'overlaps' | 'rangeGt' | 'rangeGte' | 'rangeLt' | 'rangeLte' | 'rangeAdjacent';
export type SupabaseFilterValue = unknown | [SupabaseFilterOperator, unknown] | ['not', SupabaseFilterOperator, unknown];
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
    or?: string | {
        filters: string;
        referencedTable?: string;
    };
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
    or?: string | {
        filters: string;
        referencedTable?: string;
    };
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
export declare function supabaseSelect<T = Record<string, unknown>>(table: string, options?: SupabaseSelectOptions): Promise<SupabaseResult<T>>;
/**
 * Same as {@link supabaseSelect}, but authenticated as the **signed-in
 * user**: the bearer token comes from `db.getAccessToken`, or the signed-in
 * Firebase user's ID token when `firebaseAuth` is configured — see
 * {@link resolveAccessToken}. PostgREST resolves the caller as
 * `authenticated` and RLS applies exactly as it would for `withUserDb`.
 */
export declare function supabaseSelectAsUser<T = Record<string, unknown>>(table: string, options?: SupabaseSelectOptions): Promise<SupabaseResult<T>>;
/**
 * Inserts one or more rows into `table` through the Supabase REST API, as
 * the **anonymous** role. See {@link supabaseSelect} for when to use this
 * over `withPublicDb`.
 *
 * @param table Table name.
 * @param values A single row, or an array of rows, to insert.
 * @returns The inserted row(s) as returned by PostgREST.
 */
export declare function supabaseInsert<T = Record<string, unknown>>(table: string, values: Record<string, unknown> | Record<string, unknown>[]): Promise<T[]>;
/** Same as {@link supabaseInsert}, authenticated as the signed-in user — see {@link supabaseSelectAsUser}. */
export declare function supabaseInsertAsUser<T = Record<string, unknown>>(table: string, values: Record<string, unknown> | Record<string, unknown>[]): Promise<T[]>;
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
export declare function supabaseUpsert<T = Record<string, unknown>>(table: string, values: Record<string, unknown> | Record<string, unknown>[], options?: SupabaseUpsertOptions): Promise<T[]>;
/** Same as {@link supabaseUpsert}, authenticated as the signed-in user — see {@link supabaseSelectAsUser}. */
export declare function supabaseUpsertAsUser<T = Record<string, unknown>>(table: string, values: Record<string, unknown> | Record<string, unknown>[], options?: SupabaseUpsertOptions): Promise<T[]>;
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
export declare function supabaseUpdate<T = Record<string, unknown>>(table: string, values: Record<string, unknown>, options: SupabaseMutationOptions): Promise<T[]>;
/** Same as {@link supabaseUpdate}, authenticated as the signed-in user — see {@link supabaseSelectAsUser}. */
export declare function supabaseUpdateAsUser<T = Record<string, unknown>>(table: string, values: Record<string, unknown>, options: SupabaseMutationOptions): Promise<T[]>;
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
export declare function supabaseDelete<T = Record<string, unknown>>(table: string, options: SupabaseMutationOptions): Promise<T[]>;
/** Same as {@link supabaseDelete}, authenticated as the signed-in user — see {@link supabaseSelectAsUser}. */
export declare function supabaseDeleteAsUser<T = Record<string, unknown>>(table: string, options: SupabaseMutationOptions): Promise<T[]>;
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
export declare function supabaseRpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T>;
/** Same as {@link supabaseRpc}, authenticated as the signed-in user — see {@link supabaseSelectAsUser}. */
export declare function supabaseRpcAsUser<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T>;
