import { pgTable, pgSchema, pgEnum, pgPolicy, pgView, pgMaterializedView, index, uniqueIndex, unique, primaryKey, foreignKey, check, bigint, bigserial, integer, serial, smallint, smallserial, real, doublePrecision, numeric, boolean, text, varchar, char, uuid, date, time, timestamp, interval, json, jsonb, inet, cidr, macaddr, customType } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
/**
 * Named re-exports of the `drizzle-orm/pg-core` schema builders used by
 * generated Drizzle models, so codegen output can import from this package
 * instead of taking a direct `drizzle-orm` dependency. Explicit named exports
 * (never `export *`) keep the re-export surface tree-shakeable.
 */
export { pgTable, pgSchema, pgEnum, pgPolicy, pgView, pgMaterializedView, index, uniqueIndex, unique, primaryKey, foreignKey, check, bigint, bigserial, integer, serial, smallint, smallserial, real, doublePrecision, numeric, boolean, text, varchar, char, uuid, date, time, timestamp, interval, json, jsonb, inet, cidr, macaddr, customType, sql, };
