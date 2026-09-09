import type { SqlValue, WhereNode } from './parse_where.js';
export interface FilterTarget {
    eq(column: string, value: unknown): FilterTarget;
    neq(column: string, value: unknown): FilterTarget;
    gt(column: string, value: unknown): FilterTarget;
    gte(column: string, value: unknown): FilterTarget;
    lt(column: string, value: unknown): FilterTarget;
    lte(column: string, value: unknown): FilterTarget;
    like(column: string, pattern: string): FilterTarget;
    ilike(column: string, pattern: string): FilterTarget;
    is(column: string, value: null): FilterTarget;
    in(column: string, values: readonly unknown[]): FilterTarget;
    not(column: string, operator: string, value: unknown): FilterTarget;
    or(filters: string): FilterTarget;
    regexMatch(column: string, pattern: string): FilterTarget;
    regexIMatch(column: string, pattern: string): FilterTarget;
    contains(column: string, value: unknown): FilterTarget;
    containedBy(column: string, value: unknown): FilterTarget;
    overlaps(column: string, value: unknown): FilterTarget;
    rangeGt(column: string, range: unknown): FilterTarget;
    rangeGte(column: string, range: unknown): FilterTarget;
    rangeLt(column: string, range: unknown): FilterTarget;
    rangeLte(column: string, range: unknown): FilterTarget;
    rangeAdjacent(column: string, range: unknown): FilterTarget;
    isDistinct(column: string, value: unknown): FilterTarget;
    textSearch(column: string, query: string, opts?: {
        type?: 'plain' | 'phrase' | 'websearch';
        config?: string;
    }): FilterTarget;
}
export declare function resolveValue(value: SqlValue, params: unknown[]): unknown;
export default function applyWhere<T extends FilterTarget>(builder: T, node: WhereNode, params: unknown[]): T;
