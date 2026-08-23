import { describe, expect, it } from 'vitest';
import parseStatement from './parse_statement';
import UnsupportedSqlError from './unsupported_sql';

describe('parseStatement — select', () => {
    it('parses a projection, table, where, order, limit and offset', () => {
        expect(
            parseStatement(
                'select "users"."id", "users"."name" as "userName" from "users" where "users"."id" = $1 order by "users"."name" desc nulls first, "id" limit $2 offset 5',
            ),
        ).toEqual({
            kind: 'select',
            table: 'users',
            projection: [
                { column: 'id' },
                { column: 'name', alias: 'userName' },
            ],
            where: { kind: 'compare', column: 'id', operator: 'eq', value: { kind: 'param', index: 1 } },
            orderBy: [
                { column: 'name', ascending: false, nullsFirst: true },
                { column: 'id', ascending: true },
            ],
            limit: { kind: 'param', index: 2 },
            offset: { kind: 'literal', value: 5 },
        });
    });

    it('parses select * with no clauses', () => {
        expect(parseStatement('select * from "users"')).toEqual({
            kind: 'select',
            table: 'users',
            projection: 'all',
            orderBy: [],
        });
    });

    it('parses "order by x asc nulls last"', () => {
        expect(parseStatement('select * from "t" order by "a" asc nulls last').orderBy).toEqual([
            { column: 'a', ascending: true, nullsFirst: false },
        ]);
    });

    it('rejects joins, aggregates, grouping, set operations and subqueries', () => {
        const rejected = [
            'select * from "a" inner join "b" on "a"."id" = "b"."a_id"',
            'select * from "a", "b"',
            'select count(*) from "a"',
            'select * from "a" group by "b"',
            'select distinct "a" from "b"',
            'select * from "a" union select * from "b"',
            'select * from (select 1) "x"',
            'with "c" as (select 1) select * from "c"',
            'select * from "a" for update',
            'select * from "a" "alias"',
            'select * from "a" trailing',
            'select * from "public"."a"',
            'select "a" where "a" = 1',
            'select 1 from "a"',
            'select "a".1 from "a"',
            'select "a".',
            'select * from "a" order "a"',
            'select * from "a" order by "a" as "b"',
            'select * from "a" order by "a" nulls middle',
            'select * from "a" limit \'bad\'',
            'select * from "a" $1',
            'select * from',
            'begin',
        ];
        for (const sql of rejected) {
            expect(() => parseStatement(sql), sql).toThrow(UnsupportedSqlError);
        }
    });

    it('rejects an empty statement', () => {
        expect(() => parseStatement('   ')).toThrow(UnsupportedSqlError);
    });
});
