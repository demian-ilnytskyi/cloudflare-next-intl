import { describe, expect, it } from 'vitest';
import tokenizeSql from './sql_tokens';
import parseWhere from './parse_where';
import UnsupportedSqlError from './unsupported_sql';

function parse(clause: string) {
    const tokens = tokenizeSql(`where ${clause}`);
    return parseWhere(tokens, 1);
}

describe('parseWhere', () => {
    it('parses a qualified equality against a placeholder', () => {
        expect(parse('"users"."id" = $1').node).toEqual({
            kind: 'compare',
            column: 'id',
            operator: 'eq',
            value: { kind: 'param', index: 1 },
        });
    });

    it('parses every comparison operator', () => {
        const cases: [string, string][] = [
            ['<>', 'neq'],
            ['!=', 'neq'],
            ['>', 'gt'],
            ['>=', 'gte'],
            ['<', 'lt'],
            ['<=', 'lte'],
        ];
        for (const [sql, operator] of cases) {
            expect(parse(`"a" ${sql} $1`).node).toMatchObject({ operator });
        }
        expect(parse('"a" like $1').node).toMatchObject({ operator: 'like' });
        expect(parse('"a" ilike $1').node).toMatchObject({ operator: 'ilike' });
    });

    it('parses literals, including negative numbers, booleans, strings and null', () => {
        expect(parse("\"a\" = 'x'").node).toMatchObject({ value: { kind: 'literal', value: 'x' } });
        expect(parse('"a" = 5').node).toMatchObject({ value: { kind: 'literal', value: 5 } });
        expect(parse('"a" = -5').node).toMatchObject({ value: { kind: 'literal', value: -5 } });
        expect(parse('"a" = true').node).toMatchObject({ value: { kind: 'literal', value: true } });
        expect(parse('"a" = false').node).toMatchObject({ value: { kind: 'literal', value: false } });
        expect(parse('"a" = null').node).toMatchObject({ value: { kind: 'literal', value: null } });
        expect(parse('table.col = $1').node).toMatchObject({ column: 'col' });
    });

    it('parses is null and is not null', () => {
        expect(parse('"a" is null').node).toEqual({ kind: 'is', column: 'a', negated: false });
        expect(parse('"a" is not null').node).toEqual({ kind: 'is', column: 'a', negated: true });
    });

    it('parses in lists', () => {
        expect(parse('"a" in ($1, $2, 3)').node).toEqual({
            kind: 'in',
            column: 'a',
            values: [
                { kind: 'param', index: 1 },
                { kind: 'param', index: 2 },
                { kind: 'literal', value: 3 },
            ],
            negated: false,
        });
    });

    it('parses and/or with parentheses and not', () => {
        expect(parse('("a" = $1 or "b" = $2) and not ("c" = $3)').node).toEqual({
            kind: 'and',
            children: [
                {
                    kind: 'or',
                    children: [
                        { kind: 'compare', column: 'a', operator: 'eq', value: { kind: 'param', index: 1 } },
                        { kind: 'compare', column: 'b', operator: 'eq', value: { kind: 'param', index: 2 } },
                    ],
                },
                {
                    kind: 'not',
                    child: { kind: 'compare', column: 'c', operator: 'eq', value: { kind: 'param', index: 3 } },
                },
            ],
        });
    });

    it('stops at the first clause keyword it does not own', () => {
        const tokens = tokenizeSql('where "a" = $1 order by "a"');
        const { next } = parseWhere(tokens, 1);
        expect(tokens[next]).toEqual({ kind: 'word', value: 'order' });
    });

    it('rejects constructs PostgREST cannot express', () => {
        expect(() => parse('lower("a") = $1')).toThrow(UnsupportedSqlError);
        expect(() => parse('"a" = "b"')).toThrow(UnsupportedSqlError);
        expect(() => parse('exists (select 1)')).toThrow(UnsupportedSqlError);
        expect(() => parse('"a" @@ $1')).toThrow(UnsupportedSqlError);
        expect(() => parse('"a" is true')).toThrow(UnsupportedSqlError);
        expect(() => parse('"a" in ($1')).toThrow(UnsupportedSqlError);
        expect(() => parse('"a" in $1')).toThrow(UnsupportedSqlError);
        expect(() => parse('("a" = $1')).toThrow(UnsupportedSqlError);
        expect(() => parse('')).toThrow(UnsupportedSqlError);
        expect(() => parse('order by "a"')).toThrow(UnsupportedSqlError);
        expect(() => parse('"a".')).toThrow(UnsupportedSqlError);
        expect(() => parse('"a".1')).toThrow(UnsupportedSqlError);
        expect(() => parse('"a" =')).toThrow(UnsupportedSqlError);
        expect(() => parse('"a" % $1')).toThrow(UnsupportedSqlError);
        expect(() => parse('$1 = 1')).toThrow(UnsupportedSqlError);
    });
});

describe('parseWhere — extended operators', () => {
    it('parses every postgrest-expressible operator', () => {
        const cases: [string, string][] = [
            ['~', 'regexMatch'],
            ['~*', 'regexIMatch'],
            ['@>', 'contains'],
            ['<@', 'containedBy'],
            ['&&', 'overlaps'],
            ['>>', 'rangeGt'],
            ['<<', 'rangeLt'],
            ['&>', 'rangeGte'],
            ['&<', 'rangeLte'],
            ['-|-', 'rangeAdjacent'],
        ];
        for (const [sql, operator] of cases) {
            expect(parse(`"a" ${sql} $1`).node, sql).toMatchObject({ kind: 'compare', column: 'a', operator });
        }
    });

    it('parses is distinct from', () => {
        expect(parse('"a" is distinct from $1').node).toEqual({
            kind: 'compare',
            column: 'a',
            operator: 'isDistinct',
            value: { kind: 'param', index: 1 },
        });
        expect(parse('"a" is not distinct from $1').node).toEqual({
            kind: 'not',
            child: { kind: 'compare', column: 'a', operator: 'isDistinct', value: { kind: 'param', index: 1 } },
        });
    });

    it('parses not in as a negated in', () => {
        expect(parse('"a" not in ($1)').node).toEqual({
            kind: 'in',
            column: 'a',
            values: [{ kind: 'param', index: 1 }],
            negated: true,
        });
    });

    it('parses full-text search in all four query flavours', () => {
        expect(parse('"a" @@ to_tsquery($1)').node).toEqual({
            kind: 'textSearch',
            column: 'a',
            value: { kind: 'param', index: 1 },
        });
        expect(parse('"a" @@ plainto_tsquery($1)').node).toMatchObject({ type: 'plain' });
        expect(parse('"a" @@ phraseto_tsquery($1)').node).toMatchObject({ type: 'phrase' });
        expect(parse('"a" @@ websearch_to_tsquery($1)').node).toMatchObject({ type: 'websearch' });
        expect(parse("\"a\" @@ to_tsquery('english', $1)").node).toMatchObject({ config: 'english' });
    });

    it('still rejects a text-search call it cannot read', () => {
        expect(() => parse('"a" @@ $1')).toThrow(UnsupportedSqlError);
        expect(() => parse('"a" @@ to_tsvector($1)')).toThrow(UnsupportedSqlError);
        expect(() => parse('"a" @@ to_tsquery($1')).toThrow(UnsupportedSqlError);
        expect(() => parse('"a" @@ to_tsquery')).toThrow(UnsupportedSqlError);
        expect(() => parse('"a" @@ to_tsquery($1, $2)')).toThrow(UnsupportedSqlError);
    });
});
