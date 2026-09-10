import { describe, expect, it } from 'vitest';
import applyWhere, { resolveValue, type FilterTarget } from './rest_filters.js';
import type { WhereNode } from './parse_where.js';
import UnsupportedSqlError from './unsupported_sql.js';

function recorder(): { calls: string[]; builder: FilterTarget } {
    const calls: string[] = [];
    const builder = new Proxy({} as FilterTarget, {
        get: (_target, method: string) => (...args: unknown[]) => {
            calls.push(`${method}(${args.map((arg) => JSON.stringify(arg)).join(',')})`);
            return builder;
        },
    });
    return { calls, builder };
}

describe('resolveValue', () => {
    it('reads placeholders from params and passes literals through', () => {
        expect(resolveValue({ kind: 'param', index: 2 }, ['a', 'b'])).toBe('b');
        expect(resolveValue({ kind: 'literal', value: 7 }, [])).toBe(7);
    });

    it('rejects a placeholder with no matching param', () => {
        expect(() => resolveValue({ kind: 'param', index: 3 }, ['a'])).toThrow(UnsupportedSqlError);
    });
});

describe('applyWhere', () => {
    it('applies each and-child as its own filter call', () => {
        const { calls, builder } = recorder();
        const node: WhereNode = {
            kind: 'and',
            children: [
                { kind: 'compare', column: 'a', operator: 'eq', value: { kind: 'param', index: 1 } },
                { kind: 'compare', column: 'b', operator: 'gte', value: { kind: 'literal', value: 3 } },
                { kind: 'is', column: 'c', negated: false },
                { kind: 'is', column: 'd', negated: true },
                { kind: 'in', column: 'e', values: [{ kind: 'literal', value: 1 }, { kind: 'literal', value: 2 }], negated: false },
            ],
        };
        applyWhere(builder, node, ['x']);
        expect(calls).toEqual([
            'filter("a","eq","x")',
            'filter("b","gte",3)',
            'is("c",null)',
            'not("d","is",null)',
            'filter("e","in","(1,2)")',
        ]);
    });

    it('maps like and ilike', () => {
        const { calls, builder } = recorder();
        applyWhere(builder, { kind: 'compare', column: 'a', operator: 'like', value: { kind: 'literal', value: '%x%' } }, []);
        applyWhere(builder, { kind: 'compare', column: 'a', operator: 'ilike', value: { kind: 'literal', value: '%x%' } }, []);
        expect(calls).toEqual(['filter("a","like","%x%")', 'filter("a","ilike","%x%")']);
    });

    it('serialises or/not subtrees into one or() filter string', () => {
        const { calls, builder } = recorder();
        const node: WhereNode = {
            kind: 'or',
            children: [
                { kind: 'compare', column: 'a', operator: 'eq', value: { kind: 'literal', value: 'plain' } },
                {
                    kind: 'and',
                    children: [
                        { kind: 'compare', column: 'b', operator: 'lt', value: { kind: 'literal', value: 2 } },
                        { kind: 'not', child: { kind: 'is', column: 'c', negated: false } },
                        { kind: 'is', column: 'e', negated: true },
                    ],
                },
                { kind: 'in', column: 'd', values: [{ kind: 'literal', value: 'x,y' }], negated: false },
            ],
        };
        applyWhere(builder, node, []);
        expect(calls).toEqual(['or("a.eq.plain,and(b.lt.2,not.c.is.null,not.e.is.null),d.in.(\\"x,y\\")")']);
    });

    it('rejects a value a PostgREST filter string cannot carry', () => {
        expect(() =>
            applyWhere(recorder().builder, {
                kind: 'or',
                children: [
                    { kind: 'compare', column: 'a', operator: 'eq', value: { kind: 'literal', value: 1 } },
                    { kind: 'compare', column: 'b', operator: 'eq', value: { kind: 'literal', value: null } },
                ],
            }, []),
        ).toThrow(UnsupportedSqlError);

        expect(() =>
            applyWhere(recorder().builder, {
                kind: 'or',
                children: [
                    { kind: 'compare', column: 'a', operator: 'eq', value: { kind: 'param', index: 1 } },
                ],
            }, [{}]),
        ).toThrow(UnsupportedSqlError);
    });
});

describe('applyWhere — scalar comparisons never quote their value', () => {
    // Regression coverage for a fix that shipped and then had to be
    // reverted: `.eq()`/`.filter(col,'eq',v)` interpolate the value raw —
    // `${operator}.${value}` — with no quote-stripping on PostgREST's side.
    // Quoting only means something inside `or()`/`and()`/`in.()`, which need
    // it to delimit multiple values sharing one query param. Quoting a
    // scalar `column=op.value` filter sends the literal quote characters as
    // part of the value, so it stops matching the row it used to match.
    it('forwards a string containing spaces unquoted', () => {
        const { calls, builder } = recorder();
        applyWhere(builder, { kind: 'compare', column: 'category', operator: 'eq', value: { kind: 'literal', value: 'Global Markets' } }, []);
        expect(calls).toEqual(['filter("category","eq","Global Markets")']);
    });

    it('forwards a string containing a comma unquoted', () => {
        const { calls, builder } = recorder();
        applyWhere(builder, { kind: 'compare', column: 'a', operator: 'eq', value: { kind: 'literal', value: 'x,y' } }, []);
        expect(calls).toEqual(['filter("a","eq","x,y")']);
    });

    it('forwards a string containing a quote unquoted', () => {
        const { calls, builder } = recorder();
        applyWhere(builder, { kind: 'compare', column: 'a', operator: 'eq', value: { kind: 'literal', value: 'a"b' } }, []);
        expect(calls).toEqual(['filter("a","eq","a\\"b")']);
    });

    it('forwards the empty string and reserved-looking words unquoted', () => {
        const { calls, builder } = recorder();
        for (const value of ['', 'null', 'true', 'false', '*x']) {
            applyWhere(builder, { kind: 'compare', column: 'a', operator: 'eq', value: { kind: 'literal', value } }, []);
        }
        expect(calls).toEqual([
            'filter("a","eq","")',
            'filter("a","eq","null")',
            'filter("a","eq","true")',
            'filter("a","eq","false")',
            'filter("a","eq","*x")',
        ]);
    });

    it('forwards numbers and booleans as themselves, not as strings', () => {
        const { calls, builder } = recorder();
        applyWhere(builder, { kind: 'compare', column: 'a', operator: 'gt', value: { kind: 'literal', value: 42 } }, []);
        applyWhere(builder, { kind: 'compare', column: 'b', operator: 'eq', value: { kind: 'literal', value: true } }, []);
        applyWhere(builder, { kind: 'compare', column: 'c', operator: 'lte', value: { kind: 'literal', value: -1.5 } }, []);
        expect(calls).toEqual(['filter("a","gt",42)', 'filter("b","eq",true)', 'filter("c","lte",-1.5)']);
    });

    it('applies the same unquoted forwarding to every scalar operator, not just eq', () => {
        const { calls, builder } = recorder();
        const operators = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike'] as const;
        for (const operator of operators) {
            applyWhere(builder, { kind: 'compare', column: 'a', operator, value: { kind: 'literal', value: 'v w' } }, []);
        }
        expect(calls).toEqual(operators.map((operator) => `filter("a","${operator}","v w")`));
    });

    it('rejects a Date instead of sending its toString()', () => {
        expect(() =>
            applyWhere(recorder().builder, { kind: 'compare', column: 'a', operator: 'eq', value: { kind: 'param', index: 1 } }, [new Date('2020-01-02T03:04:05Z')]),
        ).toThrow(UnsupportedSqlError);
    });

    it('rejects undefined instead of sending the string "undefined"', () => {
        expect(() =>
            applyWhere(recorder().builder, { kind: 'compare', column: 'a', operator: 'eq', value: { kind: 'param', index: 1 } }, [undefined]),
        ).toThrow(UnsupportedSqlError);
    });

    it('rejects a plain object instead of sending "[object Object]"', () => {
        expect(() =>
            applyWhere(recorder().builder, { kind: 'compare', column: 'a', operator: 'eq', value: { kind: 'param', index: 1 } }, [{ a: 1 }]),
        ).toThrow(UnsupportedSqlError);
    });

    it('rejects an array instead of sending its comma-joined toString()', () => {
        expect(() =>
            applyWhere(recorder().builder, { kind: 'compare', column: 'a', operator: 'eq', value: { kind: 'param', index: 1 } }, [[1, 2]]),
        ).toThrow(UnsupportedSqlError);
    });

    it('rejects null for eq/neq/gt/like — they cannot express IS [NOT] NULL', () => {
        for (const operator of ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike'] as const) {
            expect(() =>
                applyWhere(recorder().builder, { kind: 'compare', column: 'a', operator, value: { kind: 'literal', value: null } }, []),
            ).toThrow(UnsupportedSqlError);
        }
    });

    it('allows null for isDistinct — IS DISTINCT FROM NULL is real, intentional SQL', () => {
        const { calls, builder } = recorder();
        applyWhere(builder, { kind: 'compare', column: 'a', operator: 'isDistinct', value: { kind: 'literal', value: null } }, []);
        expect(calls).toEqual(['filter("a","isdistinct",null)']);
    });
});

describe('applyWhere — extended operators', () => {
    it('forwards each extended operator to its builder method', () => {
        const { calls, builder } = recorder();
        const operators = [
            'regexMatch', 'regexIMatch', 'contains', 'containedBy', 'overlaps',
            'rangeGt', 'rangeGte', 'rangeLt', 'rangeLte', 'rangeAdjacent', 'isDistinct',
        ] as const;
        for (const operator of operators) {
            applyWhere(builder, { kind: 'compare', column: 'a', operator, value: { kind: 'literal', value: 'v' } }, []);
        }
        // The scalar operators route through `.filter()` so their values get
        // the same encoding the serialized `or()` path applies; the array and
        // range operators keep the dedicated methods that format their own
        // structured operands.
        expect(calls).toEqual([
            'filter("a","match","v")',
            'filter("a","imatch","v")',
            'contains("a","v")',
            'containedBy("a","v")',
            'overlaps("a","v")',
            'rangeGt("a","v")',
            'rangeGte("a","v")',
            'rangeLt("a","v")',
            'rangeLte("a","v")',
            'rangeAdjacent("a","v")',
            'filter("a","isdistinct","v")',
        ]);
    });

    it('rejects operand types the array and range builder methods cannot format', () => {
        for (const operator of ['contains', 'containedBy', 'overlaps', 'rangeGt'] as const) {
            expect(() =>
                applyWhere(recorder().builder, { kind: 'compare', column: 'a', operator, value: { kind: 'literal', value: null } }, []),
            ).toThrow(UnsupportedSqlError);
        }
        // A range operator takes a range literal, never an array or an object.
        for (const value of [['x'], { k: 1 }]) {
            expect(() =>
                applyWhere(recorder().builder, { kind: 'compare', column: 'a', operator: 'rangeGt', value: { kind: 'param', index: 1 } }, [value]),
            ).toThrow(UnsupportedSqlError);
        }
        // `overlaps` takes an array but not a bare object — postgrest-js calls
        // `.join()` on its non-string branch.
        expect(() =>
            applyWhere(recorder().builder, { kind: 'compare', column: 'a', operator: 'overlaps', value: { kind: 'param', index: 1 } }, [{ k: 1 }]),
        ).toThrow(UnsupportedSqlError);

        // Arrays and JSON objects stay valid where the builder handles them.
        const { calls, builder } = recorder();
        applyWhere(builder, { kind: 'compare', column: 'a', operator: 'overlaps', value: { kind: 'param', index: 1 } }, [['x', 'y']]);
        applyWhere(builder, { kind: 'compare', column: 'b', operator: 'contains', value: { kind: 'param', index: 1 } }, [{ k: 1 }]);
        applyWhere(builder, { kind: 'compare', column: 'c', operator: 'containedBy', value: { kind: 'param', index: 1 } }, [['z']]);
        expect(calls).toEqual(['overlaps("a",["x","y"])', 'contains("b",{"k":1})', 'containedBy("c",["z"])']);
    });

    it('applies not in and text search', () => {
        const { calls, builder } = recorder();
        applyWhere(builder, { kind: 'in', column: 'a', values: [{ kind: 'literal', value: 1 }], negated: true }, []);
        applyWhere(builder, { kind: 'textSearch', column: 'b', value: { kind: 'literal', value: 'cat' }, type: 'plain', config: 'english' }, []);
        applyWhere(builder, { kind: 'textSearch', column: 'c', value: { kind: 'literal', value: 'dog' } }, []);
        expect(calls).toEqual([
            'not("a","in","(1)")',
            'textSearch("b","cat",{"type":"plain","config":"english"})',
            'textSearch("c","dog")',
        ]);
    });

    it('formats a negated `in` list as a PostgREST literal string, not a raw array', () => {
        // Regression test: postgrest-js's `.not(column, operator, value)` does
        // `${value}` with no array-aware formatting (unlike `.in()`), so a raw
        // array here previously serialized via Array.prototype.toString
        // (comma-joined, no parens) into an invalid filter PostgREST rejected
        // with a 400. Multiple values, and a value needing quoting, both need
        // to land inside one parenthesized, comma-joined literal.
        const { calls, builder } = recorder();
        applyWhere(builder, {
            kind: 'in',
            column: 'category',
            values: [{ kind: 'literal', value: 'Breaking News' }, { kind: 'literal', value: 'a,b' }],
            negated: true,
        }, []);
        expect(calls).toEqual(['not("category","in","(\\"Breaking News\\",\\"a,b\\")")']);
    });

    it('serialises extended operators inside an or() string', () => {
        const { calls, builder } = recorder();
        applyWhere(builder, {
            kind: 'or',
            children: [
                { kind: 'compare', column: 'a', operator: 'contains', value: { kind: 'literal', value: 'x' } },
                { kind: 'in', column: 'b', values: [{ kind: 'literal', value: 1 }], negated: true },
                { kind: 'textSearch', column: 'c', value: { kind: 'literal', value: 'cat' }, type: 'plain' },
                { kind: 'textSearch', column: 'd', value: { kind: 'literal', value: 'dog' }, type: 'phrase', config: 'english' },
                { kind: 'textSearch', column: 'e', value: { kind: 'literal', value: 'bird' }, type: 'websearch' },
                { kind: 'textSearch', column: 'f', value: { kind: 'literal', value: 'fish' } },
            ],
        }, []);
        expect(calls).toEqual(['or("a.cs.x,not.b.in.(1),c.plfts.cat,d.phfts(english).dog,e.wfts.bird,f.fts.fish")']);
    });

    it('handles boolean values in filter serialization', () => {
        const { calls, builder } = recorder();
        applyWhere(builder, {
            kind: 'or',
            children: [
                { kind: 'compare', column: 'a', operator: 'eq', value: { kind: 'literal', value: true } },
            ],
        }, []);
        expect(calls).toEqual(['or("a.eq.true")']);
    });

    it('throws for unknown where node kind in serialize and returns builder in applyWhere', () => {
        expect(() => applyWhere(recorder().builder, { kind: 'or', children: [{ kind: 'unknown' as never }] }, [])).toThrow(UnsupportedSqlError);
        const { builder } = recorder();
        expect(applyWhere(builder, { kind: 'unknown' as never }, [])).toBe(builder);
    });
});
