import { sql, eq, and, or, asc, desc, gte, gt, lte, lt, isNull, isNotNull, count, sum, max, min, type SQL, type Table } from 'drizzle-orm';
/**
 * Re-exported `drizzle-orm` query-building primitives, so code that only
 * calls `withPublicDb`/`withUserDb` and builds queries against the returned
 * `DrizzleDb` never needs its own `drizzle-orm` import for common predicates,
 * ordering, and aggregates.
 */
export { eq, and, or, asc, desc, gte, gt, lte, lt, isNull, isNotNull, count, sum, max, min, sql };
/**
 * Type-safe helper returning `excluded.<db_column_name>` SQL expressions for a Drizzle table.
 *
 * Restricts property access at compile time to valid table schema keys (camelCase),
 * and validates at runtime by throwing a descriptive error if an unknown property is accessed.
 *
 * @example
 * set: {
 *   inflation: excluded(inflation).inflation,
 *   yearInflation: excluded(inflation).yearInflation,
 *   updatedAt: sql`now()`,
 * }
 */
export declare function excluded<T extends Table>(table: T): {
    [K in keyof T["_"]["columns"]]: SQL;
};
/**
 * Builds a runtime and compile-time validated `set` object for `onConflictDoUpdate`.
 *
 * Only permits valid column keys of the target table. Automatically maps
 * property keys to database column names and appends `updatedAt: sql\`now()\``
 * if the column exists on the table.
 *
 * @example
 * .onConflictDoUpdate({
 *   target: inflation.date,
 *   set: onConflictSet(inflation, ["inflation", "yearInflation"]),
 * })
 */
export declare function onConflictSet<T extends Table, K extends keyof T["_"]["columns"]>(table: T, fields: K[]): Record<string, SQL>;
export type TimeUnit = "days" | "hours" | "minutes" | "months" | "years" | "weeks";
/** General SQL helper generating a timestamp expression relative to now (`now() - (N unit)::interval`). */
export declare function ago(amount: number, unit: TimeUnit): SQL;
/** General SQL helper returning `current_date`. */
export declare function currentDate(): SQL;
/** General SQL helper for window function `count(*) over ()`. */
export declare function windowCount(): SQL<number>;
/** Helper generating `lateral unnest(...) as alias(alias)`. */
export declare function unnestLateral(column: unknown, alias: string): SQL;
/** Helper generating `column asc nulls last`. */
export declare function ascNullsLast(column: unknown): SQL;
/** General SQL literal `true`, for lateral joins and empty predicate lists. */
export declare function alwaysTrue(): SQL;
/** Wraps an expression as `lateral (<inner>) <alias>`. */
export declare function lateral(inner: SQL, alias: string): SQL;
/** References `<alias>.<column>` of a derived table / lateral subquery. */
export declare function aliasColumn<T = unknown>(alias: string, column: string): SQL<T>;
/** General aggregate helpers over an arbitrary expression. */
export declare function minOf<T = unknown>(expression: unknown): SQL<T>;
export declare function maxOf<T = unknown>(expression: unknown): SQL<T>;
/** Rounds an expression to `digits` decimals, returning `real`. */
export declare function roundReal(expression: unknown, digits: number): SQL<number>;
/** Multiplies an expression by a factor. */
export declare function multiply(expression: unknown, factor: number): SQL<number>;
/** Wraps an expression as a scalar subquery over a named CTE: `(select <expr> from <cte>)`. */
export declare function scalarFromCte<T = unknown>(cte: string, expression: unknown): SQL<T>;
