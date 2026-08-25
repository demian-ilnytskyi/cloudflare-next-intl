import {
	getTableColumns,
	getTableName,
	sql,
	eq,
	and,
	or,
	asc,
	desc,
	gte,
	gt,
	lte,
	lt,
	isNull,
	isNotNull,
	count,
	sum,
	max,
	min,
	inArray,
	notInArray,
	ne,
	like,
	ilike,
	between,
	not,
	exists,
	type SQL,
	type Table,
} from 'drizzle-orm';

/**
 * Re-exported `drizzle-orm` query-building primitives, so code that only
 * calls `withPublicDb`/`withUserDb` and builds queries against the returned
 * `DrizzleDb` never needs its own `drizzle-orm` import for common predicates,
 * ordering, and aggregates.
 */
export { eq, and, or, asc, desc, gte, gt, lte, lt, isNull, isNotNull, count, sum, max, min, sql, inArray, notInArray, ne, like, ilike, between, not, exists };

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
export function excluded<T extends Table>(table: T): { [K in keyof T["_"]["columns"]]: SQL } {
    const cols = getTableColumns(table);
    const tableName = getTableName(table);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Proxy(cols, {
        get(_, prop: string) {
            const col = cols[prop];
            if (!col) {
                throw new Error(
                    `[Drizzle Error] Column "${prop}" does not exist on table "${tableName}". ` +
                        `Valid columns: ${Object.keys(cols).join(", ")}`,
                );
            }
            return sql.raw(`excluded.${col.name}`);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
}

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
export function onConflictSet<T extends Table, K extends keyof T["_"]["columns"]>(
    table: T,
    fields: K[],
): Record<string, SQL> {
    const cols = getTableColumns(table);
    const tableName = getTableName(table);
    const setObj: Record<string, SQL> = {};

    for (const field of fields) {
        const key = String(field);
        const col = cols[key];
        if (!col) {
            throw new Error(
                `[Drizzle Error] Column "${key}" does not exist on table "${tableName}". ` +
                    `Valid columns: ${Object.keys(cols).join(", ")}`,
            );
        }
        setObj[key] = sql.raw(`excluded.${col.name}`);
    }

    if ("updatedAt" in cols) {
        setObj.updatedAt = sql`now()`;
    }

    return setObj;
}

export type TimeUnit = "days" | "hours" | "minutes" | "months" | "years" | "weeks";

/** General SQL helper returning `now()`. */
export function now(): SQL {
    return sql`now()`;
}

/** General SQL helper generating a timestamp expression relative to now (`now() - (N unit)::interval`). */
export function ago(amount: number, unit: TimeUnit): SQL {
    return sql`now() - (${amount} || ' ' || ${unit})::interval`;
}

/** General SQL helper generating a timestamp expression ahead of now (`now() + (N unit)::interval`). */
export function fromNow(amount: number, unit: TimeUnit): SQL {
    return sql`now() + (${amount} || ' ' || ${unit})::interval`;
}

/** General SQL helper returning `current_date`. */
export function currentDate(): SQL {
    return sql`current_date`;
}

/** General SQL helper for window function `count(*) over ()`. */
export function windowCount(): SQL<number> {
    return sql<number>`count(*) over ()`.mapWith(Number);
}

/** Helper generating `lateral unnest(...) as alias(alias)`. */
export function unnestLateral(column: unknown, alias: string): SQL {
    return sql`lateral unnest(${column}) as ${sql.raw(alias)}(${sql.raw(alias)})`;
}

/** Helper generating `column asc nulls last`. */
export function ascNullsLast(column: unknown): SQL {
    return sql`${column} asc nulls last`;
}

/** General SQL literal `true`, for lateral joins and empty predicate lists. */
export function alwaysTrue(): SQL {
    return sql`true`;
}

/** Wraps an expression as `lateral (<inner>) <alias>`. */
export function lateral(inner: SQL, alias: string): SQL {
    return sql`lateral (${inner}) ${sql.raw(alias)}`;
}

/** References `<alias>.<column>` of a derived table / lateral subquery. */
export function aliasColumn<T = unknown>(alias: string, column: string): SQL<T> {
    return sql.raw(`${alias}.${column}`) as SQL<T>;
}

/** General aggregate helpers over an arbitrary expression. */
export function minOf<T = unknown>(expression: unknown): SQL<T> {
    return sql`min(${expression})`;
}

export function maxOf<T = unknown>(expression: unknown): SQL<T> {
    return sql`max(${expression})`;
}

/** Rounds an expression to `digits` decimals, returning `real`. */
export function roundReal(expression: unknown, digits: number): SQL<number> {
    return sql`round((${expression})::numeric, ${digits})::real`;
}

/** Multiplies an expression by a factor. */
export function multiply(expression: unknown, factor: number): SQL<number> {
    return sql`${expression} * ${factor}`;
}

/**
 * Wraps an aggregate over a subquery/CTE as a scalar subquery:
 * `(select <expr> from <source>)`.
 *
 * Unlike {@link scalarFromCte} this takes the Drizzle CTE/subquery object
 * rather than its name, so the source is referenced through the query builder
 * and its columns stay typed.
 *
 * @param source A Drizzle CTE or subquery to read from.
 * @param expression The aggregate expression to select.
 * @returns A scalar subquery usable directly in a `select({...})`.
 *
 * @example
 * select({ lowest: scalarFrom(filtered, minOf(filtered.price)) })
 */
export function scalarFrom<T = unknown>(source: unknown, expression: unknown): SQL<T> {
    return sql`(select ${expression} from ${source})`;
}

/** Wraps an expression as a scalar subquery over a named CTE: `(select <expr> from <cte>)`. */
export function scalarFromCte<T = unknown>(cte: string, expression: unknown): SQL<T> {
    return sql`(select ${expression} from ${sql.raw(cte)})`;
}
