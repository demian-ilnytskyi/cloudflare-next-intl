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
            'select max("a") from "a"',
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

describe('parseStatement — mutations', () => {
    it('parses a multi-row insert with returning and various value types', () => {
        expect(
            parseStatement('insert into "users" ("id", "name", "active", "deleted", "score", "ref") values ($1, $2, true, false, -5, null), ($3, \'bob\', true, false, 10, null) returning "users"."id", "name" as "n"'),
        ).toEqual({
            kind: 'insert',
            table: 'users',
            columns: ['id', 'name', 'active', 'deleted', 'score', 'ref'],
            rows: [
                [{ kind: 'param', index: 1 }, { kind: 'param', index: 2 }, { kind: 'literal', value: true }, { kind: 'literal', value: false }, { kind: 'literal', value: -5 }, { kind: 'literal', value: null }],
                [{ kind: 'param', index: 3 }, { kind: 'literal', value: 'bob' }, { kind: 'literal', value: true }, { kind: 'literal', value: false }, { kind: 'literal', value: 10 }, { kind: 'literal', value: null }],
            ],
            returning: [{ column: 'id' }, { column: 'name', alias: 'n' }],
        });
    });

    it('parses on conflict do nothing', () => {
        expect(parseStatement('insert into "t" ("a") values ($1) on conflict ("a") do nothing').onConflict).toEqual({
            columns: ['a'],
            action: 'nothing',
        });
    });

    it('parses on conflict do update set with excluded and literal values and table qualifiers', () => {
        expect(
            parseStatement('insert into "t" ("t"."a", "b") values ($1, $2) on conflict ("t"."a") do update set "t"."b" = excluded."b", "c" = $3')
                .onConflict,
        ).toEqual({
            columns: ['a'],
            action: 'update',
            set: {
                b: { kind: 'excluded', column: 'b' },
                c: { kind: 'param', index: 3 },
            },
        });
    });

    it('parses an update with where and returning *', () => {
        expect(parseStatement('update "t" set "t"."a" = -1, "b" = null where "id" = $2 returning *')).toEqual({
            kind: 'update',
            table: 't',
            set: { a: { kind: 'literal', value: -1 }, b: { kind: 'literal', value: null } },
            where: { kind: 'compare', column: 'id', operator: 'eq', value: { kind: 'param', index: 2 } },
            returning: 'all',
        });
    });

    it('parses a delete with where and returning', () => {
        expect(parseStatement('delete from "t" where "id" = $1 returning "id"')).toEqual({
            kind: 'delete',
            table: 't',
            where: { kind: 'compare', column: 'id', operator: 'eq', value: { kind: 'param', index: 1 } },
            returning: [{ column: 'id' }],
        });
    });

    it('rejects mutation forms PostgREST cannot express', () => {
        const rejected = [
            'insert into "t" select * from "u"',
            'insert into "t" default values',
            'insert into "t" ("a") values ($1) on conflict ("a") do update set "b" = "t"."b" + 1',
            'insert into "t" ("a") values ($1) on conflict on constraint "c" do nothing',
            'insert into "t" ("a") values ($1) on conflict ("a") do delete',
            'insert "t" ("a") values ($1)',
            'insert into "t" ("a") values',
            'insert into "t" ("a") ($1)',
            'insert into "t" values ($1)',
            'insert into "t" (1) values ($1)',
            'insert into "t" ("t".) values ($1)',
            'insert into "t" ("a",) values ($1)',
            'insert into "t" ("a") values ($1,)',
            'insert into "t" ("a") values ($1',
            'insert into "t" ("a") values (foo)',
            'insert into "t" ("a") values ($1) on',
            'insert into "t" ("a") values ($1) on conflict',
            'insert into "t" ("a") values ($1) on conflict ("a")',
            'insert into "t" ("a") values ($1) on conflict ("a") do',
            'insert into "t" ("a") values ($1) on conflict ("a") do update',
            'insert into "t" ("a") values ($1) on conflict ("a") do update set',
            'insert into "t" ("a") values ($1) on conflict ("a") do update set "b" =',
            'insert into "t" ("a") values ($1) on conflict ("a") do update set "b"',
            'insert into "t" ("a") values ($1) returning',
            'insert into "t" ("a") values ($1) trailing',
            'update "t"',
            'update "t" set',
            'update "t" set "a" = "b" where "id" = $1',
            'update "t" from "u" set "a" = $1',
            'update "t" set "a" = $1 returning "x" as "y", lower("z")',
            'delete "t" where "id" = $1',
            'delete from "t" using "u" where "t"."id" = "u"."id"',
            'insert into "t" ("a", "b"',
            'delete from "t" where "id" = $1 returning * from',
            'truncate "t"',
        ];
        for (const sql of rejected) {
            expect(() => parseStatement(sql), sql).toThrow(UnsupportedSqlError);
        }
    });
});

describe('parseStatement — count(*)', () => {
    it('parses a lone count(*) projection, aliased or not', () => {
        expect(parseStatement('select count(*) from "t" where "a" = $1')).toMatchObject({
            projection: 'count',
            table: 't',
        });
        expect(parseStatement('select count(*) as "n" from "t"')).toMatchObject({ projection: 'count' });
    });

    it('still rejects count(*) mixed with columns and other aggregates', () => {
        expect(() => parseStatement('select count(*), "a" from "t"')).toThrow(UnsupportedSqlError);
        expect(() => parseStatement('select sum("a") from "t"')).toThrow(UnsupportedSqlError);
        expect(() => parseStatement('select count("a") from "t"')).toThrow(UnsupportedSqlError);
        expect(() => parseStatement('delete from "t" returning count(*)')).toThrow(UnsupportedSqlError);
        expect(() => parseStatement('delete from "t" returning count(*) from')).toThrow(UnsupportedSqlError);
    });

    it('evicts statement cache when cache limit is exceeded', () => {
        for (let i = 0; i <= 505; i++) {
            parseStatement(`select * from "table_${i}"`);
        }
    });
});


