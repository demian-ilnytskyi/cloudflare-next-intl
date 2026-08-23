import { describe, expect, it } from 'vitest';
import applyWhere, { resolveValue, type FilterTarget } from './rest_filters';
import type { WhereNode } from './parse_where';
import UnsupportedSqlError from './unsupported_sql';

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
                { kind: 'in', column: 'e', values: [{ kind: 'literal', value: 1 }, { kind: 'literal', value: 2 }] },
            ],
        };
        applyWhere(builder, node, ['x']);
        expect(calls).toEqual([
            'eq("a","x")',
            'gte("b",3)',
            'is("c",null)',
            'not("d","is",null)',
            'in("e",[1,2])',
        ]);
    });

    it('maps like and ilike', () => {
        const { calls, builder } = recorder();
        applyWhere(builder, { kind: 'compare', column: 'a', operator: 'like', value: { kind: 'literal', value: '%x%' } }, []);
        applyWhere(builder, { kind: 'compare', column: 'a', operator: 'ilike', value: { kind: 'literal', value: '%x%' } }, []);
        expect(calls).toEqual(['like("a","%x%")', 'ilike("a","%x%")']);
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
                { kind: 'in', column: 'd', values: [{ kind: 'literal', value: 'x,y' }] },
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
