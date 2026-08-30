import { getTableColumns, getTableName, sql, eq, and, or, asc, desc, gte, gt, lte, lt, isNull, isNotNull, count, sum, max, min, inArray, notInArray, ne, like, ilike, between, not, exists, } from 'drizzle-orm';
export { eq, and, or, asc, desc, gte, gt, lte, lt, isNull, isNotNull, count, sum, max, min, sql, inArray, notInArray, ne, like, ilike, between, not, exists };
export function excluded(table) {
    const cols = getTableColumns(table);
    const tableName = getTableName(table);
    return new Proxy(cols, {
        get(_, prop) {
            const col = cols[prop];
            if (!col) {
                throw new Error(`[Drizzle Error] Column "${prop}" does not exist on table "${tableName}". ` +
                    `Valid columns: ${Object.keys(cols).join(", ")}`);
            }
            return sql.raw(`excluded.${col.name}`);
        },
    });
}
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
export function now() {
    return sql `now()`;
}
export function ago(amount, unit) {
    return sql `now() - (${amount} || ' ' || ${unit})::interval`;
}
export function fromNow(amount, unit) {
    return sql `now() + (${amount} || ' ' || ${unit})::interval`;
}
export function currentDate() {
    return sql `current_date`;
}
export function windowCount() {
    return sql `count(*) over ()`.mapWith(Number);
}
export function unnestLateral(column, alias) {
    return sql `lateral unnest(${column}) as ${sql.raw(alias)}(${sql.raw(alias)})`;
}
export function ascNullsLast(column) {
    return sql `${column} asc nulls last`;
}
export function alwaysTrue() {
    return sql `true`;
}
export function lateral(inner, alias) {
    return sql `lateral (${inner}) ${sql.raw(alias)}`;
}
export function aliasColumn(alias, column) {
    return sql.raw(`${alias}.${column}`);
}
export function minOf(expression) {
    return sql `min(${expression})`;
}
export function maxOf(expression) {
    return sql `max(${expression})`;
}
export function roundReal(expression, digits) {
    return sql `round((${expression})::numeric, ${digits})::real`;
}
export function multiply(expression, factor) {
    return sql `${expression} * ${factor}`;
}
export function scalarFrom(source, expression) {
    return sql `(select ${expression} from ${source})`;
}
export function scalarFromCte(cte, expression) {
    return sql `(select ${expression} from ${sql.raw(cte)})`;
}
