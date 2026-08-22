import { getTableColumns, getTableName, sql } from "drizzle-orm";
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
export function excluded(table) {
    const cols = getTableColumns(table);
    const tableName = getTableName(table);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Proxy({}, {
        get(_, prop) {
            const col = cols[prop];
            if (!col) {
                throw new Error(`[Drizzle Error] Column "${prop}" does not exist on table "${tableName}". ` +
                    `Valid columns: ${Object.keys(cols).join(", ")}`);
            }
            return sql.raw(`excluded.${col.name}`);
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    });
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
export function onConflictSet(table, fields) {
    const cols = getTableColumns(table);
    const tableName = getTableName(table);
    const setObj = {};
    for (const field of fields) {
        const key = String(field);
        const col = cols[key];
        if (!col) {
            throw new Error(`[Drizzle Error] Column "${key}" does not exist on table "${tableName}". ` +
                `Valid columns: ${Object.keys(cols).join(", ")}`);
        }
        setObj[key] = sql.raw(`excluded.${col.name}`);
    }
    if ("updatedAt" in cols) {
        setObj.updatedAt = sql `now()`;
    }
    return setObj;
}
/** General SQL helper generating a timestamp expression relative to now (`now() - (N unit)::interval`). */
export function ago(amount, unit) {
    return sql `now() - (${amount} || ' ' || ${unit})::interval`;
}
/** General SQL helper returning `current_date`. */
export function currentDate() {
    return sql `current_date`;
}
/** General SQL helper for window function `count(*) over ()`. */
export function windowCount() {
    return sql `count(*) over ()`.mapWith(Number);
}
/** Helper generating `lateral unnest(...) as alias(alias)`. */
export function unnestLateral(column, alias) {
    return sql `lateral unnest(${column}) as ${sql.raw(alias)}(${sql.raw(alias)})`;
}
/** Helper generating `column asc nulls last`. */
export function ascNullsLast(column) {
    return sql `${column} asc nulls last`;
}
/** General SQL literal `true`, for lateral joins and empty predicate lists. */
export function alwaysTrue() {
    return sql `true`;
}
/** Wraps an expression as `lateral (<inner>) <alias>`. */
export function lateral(inner, alias) {
    return sql `lateral (${inner}) ${sql.raw(alias)}`;
}
/** References `<alias>.<column>` of a derived table / lateral subquery. */
export function aliasColumn(alias, column) {
    return sql.raw(`${alias}.${column}`);
}
/** General aggregate helpers over an arbitrary expression. */
export function minOf(expression) {
    return sql `min(${expression})`;
}
export function maxOf(expression) {
    return sql `max(${expression})`;
}
/** Rounds an expression to `digits` decimals, returning `real`. */
export function roundReal(expression, digits) {
    return sql `round((${expression})::numeric, ${digits})::real`;
}
/** Multiplies an expression by a factor. */
export function multiply(expression, factor) {
    return sql `${expression} * ${factor}`;
}
/** Wraps an expression as a scalar subquery over a named CTE: `(select <expr> from <cte>)`. */
export function scalarFromCte(cte, expression) {
    return sql `(select ${expression} from ${sql.raw(cte)})`;
}
