import type { SqlToken } from './sql_tokens.js';
export type SqlValue = {
    kind: 'param';
    index: number;
} | {
    kind: 'literal';
    value: string | number | boolean | null;
};
export type CompareOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'regexMatch' | 'regexIMatch' | 'contains' | 'containedBy' | 'overlaps' | 'rangeGt' | 'rangeGte' | 'rangeLt' | 'rangeLte' | 'rangeAdjacent' | 'isDistinct';
export type WhereNode = {
    kind: 'and' | 'or';
    children: WhereNode[];
} | {
    kind: 'not';
    child: WhereNode;
} | {
    kind: 'compare';
    column: string;
    operator: CompareOperator;
    value: SqlValue;
} | {
    kind: 'is';
    column: string;
    negated: boolean;
} | {
    kind: 'in';
    column: string;
    values: SqlValue[];
    negated: boolean;
} | {
    kind: 'textSearch';
    column: string;
    value: SqlValue;
    type?: 'plain' | 'phrase' | 'websearch';
    config?: string;
};
export interface WhereParse {
    node: WhereNode;
    next: number;
}
export default function parseWhere(tokens: SqlToken[], start: number): WhereParse;
