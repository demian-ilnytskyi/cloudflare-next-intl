import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import parseStatement from './parse_statement.js';
import executeRest from './rest_execute.js';
import type { RestClient } from './rest_client.js';
import UnsupportedSqlError from './unsupported_sql.js';

/**
 * End-to-end URL rendering: SQL string -> parse -> PostgREST request.
 *
 * Every other test file in this package mocks the query builder and asserts
 * the *call shape* it receives (`in("a",[1])`), which cannot see how
 * postgrest-js then serializes those arguments into a URL. That blind spot
 * shipped a production bug: a negated `in` was handed a raw array, and
 * postgrest-js's generic `.not()` stringified it via `Array.prototype
 * .toString()` into `not.in.a,b` — no parentheses, no quoting — which
 * PostgREST rejects with a 400.
 *
 * These tests run the real `@supabase/supabase-js` client against a stub
 * `fetch` and assert on the query string that would actually go over the
 * wire, so a mistranslation is visible as the malformed filter it is.
 */

const PROJECT_URL = 'https://project.supabase.co';

/** Renders the PostgREST query string a statement produces. */
async function render(sql: string, params: unknown[] = []): Promise<string> {
    let captured = '';
    const fetchStub = (async (input: unknown) => {
        const href = typeof input === 'string'
            ? input
            : input instanceof URL ? input.href : (input as Request).url;
        const url = new URL(href);
        captured = [...url.searchParams.entries()].map(([key, value]) => `${key}=${value}`).join('&');
        return new Response('[]', {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'content-range': '*/0' },
        });
    }) as typeof fetch;

    const client = createClient(PROJECT_URL, 'anon-key', { global: { fetch: fetchStub } });
    await executeRest(client as unknown as RestClient, parseStatement(sql), params);
    return captured;
}

/** Renders just the filters, dropping the `select=` projection prefix. */
async function filters(where: string, params: unknown[] = []): Promise<string> {
    const rendered = await render(`select "a" from "t" where ${where}`, params);
    return rendered.replace(/^select=a&?/, '');
}

describe('URL rendering — projection, order, pagination', () => {
    it('renders a plain select', async () => {
        expect(await render('select "a", "b" from "t"')).toBe('select=a,b');
    });

    it('renders aliased columns', async () => {
        expect(await render('select "a" as "x", "b" from "t"')).toBe('select=x:a,b');
    });

    it('renders order by, including direction and explicit null placement', async () => {
        expect(await render('select "a" from "t" order by "t"."a" asc')).toBe('select=a&order=a.asc');
        expect(await render('select "a" from "t" order by "t"."a" desc')).toBe('select=a&order=a.desc');
        expect(await render('select "a" from "t" order by "t"."a" desc nulls last, "t"."b" asc'))
            .toBe('select=a&order=a.desc.nullslast,b.asc');
        expect(await render('select "a" from "t" order by "t"."a" asc nulls first'))
            .toBe('select=a&order=a.asc.nullsfirst');
    });

    it('renders limit, offset, and limit+offset as a range', async () => {
        expect(await render('select "a" from "t" limit $1', [10])).toBe('select=a&limit=10');
        expect(await render('select "a" from "t" limit $1 offset $2', [10, 20]))
            .toBe('select=a&offset=20&limit=10');
    });

    it('asks for an exact head count when there is no projection', async () => {
        expect(await render('select count(*) from "t"')).toBe('select=');
    });
});

describe('URL rendering — comparison filters', () => {
    it('renders every scalar comparison operator', async () => {
        expect(await filters('"t"."a" = $1', ['x'])).toBe('a=eq.x');
        expect(await filters('"t"."a" <> $1', ['x'])).toBe('a=neq.x');
        expect(await filters('"t"."a" > $1', [1])).toBe('a=gt.1');
        expect(await filters('"t"."a" >= $1', [1])).toBe('a=gte.1');
        expect(await filters('"t"."a" < $1', [1])).toBe('a=lt.1');
        expect(await filters('"t"."a" <= $1', [1])).toBe('a=lte.1');
        expect(await filters('"t"."a" like $1', ['%x%'])).toBe('a=like.%x%');
        expect(await filters('"t"."a" ilike $1', ['%x%'])).toBe('a=ilike.%x%');
    });

    it('stacks and-ed filters as separate query params', async () => {
        expect(await filters('("t"."a" = $1 and "t"."b" = $2)', ['x', 'y'])).toBe('a=eq.x&b=eq.y');
    });

    it('renders is null and is not null', async () => {
        expect(await filters('"t"."a" is null')).toBe('a=is.null');
        expect(await filters('"t"."a" is not null')).toBe('a=not.is.null');
    });

    it('renders booleans and numbers unquoted', async () => {
        expect(await filters('"t"."a" = $1', [true])).toBe('a=eq.true');
        expect(await filters('"t"."a" = $1', [42])).toBe('a=eq.42');
        expect(await filters('"t"."a" = $1', [-1.5])).toBe('a=eq.-1.5');
    });
});

describe('URL rendering — in / not in', () => {
    it('renders in and not in as parenthesized lists', async () => {
        expect(await filters('"t"."a" in ($1, $2)', ['x', 'y'])).toBe('a=in.(x,y)');
        expect(await filters('"t"."a" not in ($1, $2)', ['x', 'y'])).toBe('a=not.in.(x,y)');
    });

    it('renders a single-value not in with its parentheses', async () => {
        // The original production bug: `not.in.Breaking News`, unparenthesized.
        expect(await filters('"t"."a" not in ($1)', ['Breaking News'])).toBe('a=not.in.("Breaking News")');
    });

    it('quotes list values containing PostgREST-reserved characters', async () => {
        expect(await filters('"t"."a" in ($1, $2)', ['x,y', 'z'])).toBe('a=in.("x,y",z)');
        expect(await filters('"t"."a" not in ($1, $2)', ['x,y', 'z'])).toBe('a=not.in.("x,y",z)');
    });

    it('escapes embedded quotes identically in both directions', async () => {
        // postgrest-js's own `.in()` quotes on `,()` but does NOT escape an
        // inner `"`, so it alone would emit the malformed `in.("a"b,c",z)`.
        expect(await filters('"t"."a" in ($1, $2)', ['a"b,c', 'z'])).toBe('a=in.("a\\"b,c",z)');
        expect(await filters('"t"."a" not in ($1, $2)', ['a"b,c', 'z'])).toBe('a=not.in.("a\\"b,c",z)');
    });

    it('combines in and not in on one column', async () => {
        expect(await filters('("t"."a" in ($1) and "t"."a" not in ($2))', ['News', 'Breaking News']))
            .toBe('a=in.(News)&a=not.in.("Breaking News")');
    });
});

describe('URL rendering — boolean structure', () => {
    it('renders a top-level or', async () => {
        expect(await filters('("t"."a" = $1 or "t"."b" = $2)', ['x', 'y'])).toBe('or=(a.eq.x,b.eq.y)');
    });

    it('keeps a nested or grouped inside an and', async () => {
        // Flattening this into the and turns `b=2 AND (c=3 OR d=4)` into
        // `b=2 AND c=3 AND d=4` — silently wrong rows, no error.
        expect(
            await filters('("t"."a" = $1 or ("t"."b" = $2 and ("t"."c" = $3 or "t"."d" = $4)))', ['1', '2', '3', '4']),
        ).toBe('or=(a.eq.1,and(b.eq.2,or(c.eq.3,d.eq.4)))');
    });

    it('keeps a nested and grouped inside an or', async () => {
        expect(await filters('("t"."a" = $1 or ("t"."b" = $2 and "t"."c" = $3))', ['1', '2', '3']))
            .toBe('or=(a.eq.1,and(b.eq.2,c.eq.3))');
    });

    it('negates a whole or, not just its first disjunct', async () => {
        // `not.a.eq.x,b.eq.y` would mean `NOT(a=x) OR b=y`.
        expect(await filters('not ("t"."a" = $1 or "t"."b" = $2)', ['x', 'y']))
            .toBe('or=(not.or(a.eq.x,b.eq.y))');
    });

    it('negates a whole and', async () => {
        expect(await filters('not ("t"."a" = $1 and "t"."b" = $2)', ['x', 'y']))
            .toBe('or=(not.and(a.eq.x,b.eq.y))');
    });

    it('renders an or over in/is nodes', async () => {
        expect(await filters('("t"."a" in ($1, $2) or "t"."b" is null)', ['x', 'y']))
            .toBe('or=(a.in.(x,y),b.is.null)');
        expect(await filters('("t"."a" not in ($1) or "t"."b" is not null)', ['x']))
            .toBe('or=(not.a.in.(x),not.b.is.null)');
    });

    it('renders deeply nested combinations', async () => {
        expect(
            await filters(
                '(("t"."a" = $1 or "t"."b" = $2) and ("t"."c" = $3 or "t"."d" = $4))',
                ['1', '2', '3', '4'],
            ),
        ).toBe('or=(a.eq.1,b.eq.2)&or=(c.eq.3,d.eq.4)');
    });
});

describe('URL rendering — value encoding hazards inside or()/in() (quoted paths)', () => {
    it('quotes a string that would otherwise read as SQL NULL', async () => {
        expect(await filters('("t"."a" = $1 or "t"."b" = $2)', ['null', 'z'])).toBe('or=(a.eq."null",b.eq.z)');
        expect(await filters('"t"."a" in ($1)', ['null'])).toBe('a=in.("null")');
    });

    it('quotes the empty string', async () => {
        expect(await filters('"t"."a" in ($1, $2)', ['', 'z'])).toBe('a=in.("",z)');
    });

    it('escapes backslashes so a value cannot break out of its quoting', async () => {
        // Without escaping the backslash, PostgREST reads `\"` as a literal
        // quote, the value terminates early, and the rest of the string is
        // parsed as sibling filters — filter injection.
        expect(await filters('"t"."a" in ($1)', ['a\\",z),(a.eq.pwned']))
            .toBe('a=in.("a\\\\\\",z),(a.eq.pwned")');
    });

    it('quotes values containing spaces, dots and parentheses', async () => {
        expect(await filters('("t"."a" = $1 or "t"."b" = $2)', ['hello world', 'a.b'])).toBe('or=(a.eq."hello world",b.eq."a.b")');
        expect(await filters('"t"."a" in ($1)', ['f(x)'])).toBe('a=in.("f(x)")');
    });
});

describe('URL rendering — a plain scalar filter never quotes its value', () => {
    // A plain `column=op.value` filter has exactly one value and no
    // delimiter to protect, so PostgREST does not support (or strip) the
    // `"..."` quoting `or()`/`in()` need — it takes the value verbatim. A
    // string like `'null'`, `''`, or one containing a space, comma, or quote
    // is therefore sent through byte-for-byte, same as postgrest-js's own
    // `.eq()` always did; quoting it here would send the literal quote
    // characters as part of the value and stop it matching anything.
    it('sends a string that would otherwise read as SQL NULL as-is', async () => {
        expect(await filters('"t"."a" = $1', ['null'])).toBe('a=eq.null');
    });

    it('sends strings that would otherwise read as booleans as-is', async () => {
        expect(await filters('"t"."a" = $1', ['true'])).toBe('a=eq.true');
        expect(await filters('"t"."a" = $1', ['false'])).toBe('a=eq.false');
    });

    it('sends the empty string as-is', async () => {
        expect(await filters('"t"."a" = $1', [''])).toBe('a=eq.');
    });

    it('sends a leading * as-is', async () => {
        expect(await filters('"t"."a" = $1', ['*'])).toBe('a=eq.*');
    });

    it('sends spaces, dots, parentheses, commas and quotes as-is', async () => {
        expect(await filters('"t"."a" = $1', ['hello world'])).toBe('a=eq.hello world');
        expect(await filters('"t"."a" = $1', ['a.b'])).toBe('a=eq.a.b');
        expect(await filters('"t"."a" = $1', ['f(x)'])).toBe('a=eq.f(x)');
        expect(await filters('"t"."a" = $1', ['x,y'])).toBe('a=eq.x,y');
        expect(await filters('"t"."a" = $1', ['a"b'])).toBe('a=eq.a"b');
    });

    it('applies no quoting to every scalar operator, not just eq', async () => {
        expect(await filters('"t"."a" <> $1', ['null'])).toBe('a=neq.null');
        expect(await filters('"t"."a" > $1', ['a.b'])).toBe('a=gt.a.b');
        expect(await filters('"t"."a" like $1', ['%a,b%'])).toBe('a=like.%a,b%');
    });
});

describe('URL rendering — values PostgREST filters cannot carry', () => {
    const rejects = async (where: string, params: unknown[]) => {
        await expect(filters(where, params)).rejects.toThrow(UnsupportedSqlError);
    };

    it('rejects a Date rather than sending its toString()', async () => {
        await rejects('"t"."a" = $1', [new Date('2020-01-02T03:04:05Z')]);
    });

    it('rejects undefined and null-valued comparisons', async () => {
        await rejects('"t"."a" = $1', [undefined]);
        await rejects('"t"."a" = $1', [null]);
    });

    it('rejects objects and arrays on scalar comparisons', async () => {
        await rejects('"t"."a" = $1', [{ a: 1 }]);
        await rejects('"t"."a" = $1', [[1, 2]]);
    });

    it('rejects a null array operand instead of crashing inside postgrest-js', async () => {
        // postgrest-js's overlaps() calls value.join() on the non-string
        // branch, so a null here threw a TypeError that escaped the driver
        // entirely rather than falling back to raw SQL.
        await rejects('"t"."a" && $1', [null]);
        await rejects('"t"."a" && $1', [{ a: 1 }]);
    });

    it('still allows the array/range operators their real operand types', async () => {
        expect(await filters('"t"."a" && $1', ['{x,y}'])).toBe('a=ov.{x,y}');
        expect(await filters('"t"."a" @> $1', ['{x}'])).toBe('a=cs.{x}');
        expect(await filters('"t"."a" <@ $1', ['{x}'])).toBe('a=cd.{x}');
        expect(await filters('"t"."a" >> $1', ['[1,2)'])).toBe('a=sr.[1,2)');
    });
});

describe('URL rendering — insert, update, delete', () => {
    it('renders an update with filters and a returning projection', async () => {
        expect(await render('update "t" set "a" = $1 where "t"."b" = $2 returning "a"', ['x', 'y']))
            .toBe('select=a&b=eq.y');
    });

    it('renders a delete with filters', async () => {
        expect(await render('delete from "t" where "t"."a" in ($1, $2) returning "a"', ['x', 'y']))
            .toBe('select=a&a=in.(x,y)');
    });

    it('renders an insert projection', async () => {
        expect(await render('insert into "t" ("a") values ($1) returning "a"', ['x']))
            .toBe('columns="a"&select=a');
    });

    it('applies the same value encoding on update and delete filters as select does', async () => {
        expect(await render('delete from "t" where "t"."a" = $1 returning "a"', ['null']))
            .toBe('select=a&a=eq.null');
        expect(await render('update "t" set "a" = $1 where "t"."b" not in ($2) returning "a"', ['x', 'a,b']))
            .toBe('select=a&b=not.in.("a,b")');
    });
});
