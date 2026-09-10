import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { QueryBuilder, pgTable, text, timestamp, bigint, boolean, smallint, varchar } from 'drizzle-orm/pg-core';
import { and, asc, desc, eq, inArray, isNotNull, lte, ne, notInArray } from 'drizzle-orm';
import parseStatement from './parse_statement.js';
import executeRest from './rest_execute.js';
import type { RestClient } from './rest_client.js';

/**
 * Renders real-world `drizzle-orm` query builder chains — the same shapes a
 * production edge function sends through `withPublicDb`/`withUserDb` — end
 * to end through this package's translation pipeline (`.toSQL()` -> the
 * actual `parseStatement`/`applyWhere` this package ships -> a real
 * `@supabase/supabase-js` client against a stubbed `fetch`) and asserts the
 * resulting PostgREST query string.
 *
 * Built with `QueryBuilder` (drizzle-orm's connection-free query builder), so
 * the SQL comes from Drizzle itself rather than a hand-typed approximation of
 * it — this is what caught the production bug in the first place: combining
 * `inArray` + `notInArray` on the same column, which the mock-based tests
 * elsewhere in this package could not have exercised because they never
 * render a URL.
 */

const qb = new QueryBuilder();

/** A generic content table — column shapes only, no real project's schema. */
const postsTable = pgTable('posts', {
    id: bigint({ mode: 'number' }),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'string' }),
    title: text(),
    excerpt: text(),
    category: text(),
    tag: text(),
    imageUrl: text('image_url'),
    isPremium: boolean('is_premium'),
});

const tagsTable = pgTable('tags', {
    name: text(),
    rank: smallint(),
    section: text(),
    sectionRank: smallint('section_rank'),
});

const readProgressTable = pgTable('read_progress', {
    userId: varchar('user_id', { length: 128 }),
    postId: bigint('post_id', { mode: 'number' }),
});

async function renderSql(sql: string, params: unknown[]): Promise<string> {
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

    const client = createClient('https://project.supabase.co', 'anon-key', { global: { fetch: fetchStub } });
    await executeRest(client as unknown as RestClient, parseStatement(sql), params);
    return captured;
}

/** Builds and renders a Drizzle query builder chain in one step. */
async function render(query: { toSQL(): { sql: string; params: unknown[] } }): Promise<string> {
    const { sql, params } = query.toSQL();
    return renderSql(sql, params);
}

describe('real-world query shapes — a category feed excluding a sibling category', () => {
    it('renders an inArray + notInArray filter on the same column', async () => {
        const query = qb
            .select({
                id: postsTable.id,
                published_at: postsTable.publishedAt,
                title: postsTable.title,
                excerpt: postsTable.excerpt,
                tag: postsTable.tag,
                image_url: postsTable.imageUrl,
                is_premium: postsTable.isPremium,
            })
            .from(postsTable)
            .where(
                and(
                    inArray(postsTable.category, ['News']),
                    notInArray(postsTable.category, ['Editorial']),
                ),
            )
            .orderBy(desc(postsTable.publishedAt), desc(postsTable.id))
            .limit(11)
            .offset(0);

        // The exact combination that shipped a production 400: an `in`
        // and a `not in` on the same column. Both must render as valid,
        // independently-parenthesized PostgREST filters.
        expect(await render(query)).toBe(
            'select=id,published_at,title,excerpt,tag,image_url,is_premium'
            + '&category=in.(News)&category=not.in.(Editorial)'
            + '&order=published_at.desc,id.desc&limit=11',
        );
    });
});

describe('real-world query shapes — a single-category paginated feed', () => {
    it('renders equality plus a limit+offset range', async () => {
        // A two-word category name on purpose: this exact shape (a plain
        // `eq()` against a value containing a space) is what a follow-up fix
        // briefly broke in production — it started quoting scalar `eq`
        // values the same way `in()`/`or()` need to, which sent PostgREST
        // the literal quote characters as part of the value and matched zero
        // rows (an empty feed, not an error). See the guard test below for
        // the full incident writeup. A single-word value like `'Markets'`
        // would not have caught that regression, so this uses one that does.
        const query = qb
            .select({
                id: postsTable.id,
                published_at: postsTable.publishedAt,
                title: postsTable.title,
                excerpt: postsTable.excerpt,
                tag: postsTable.tag,
                image_url: postsTable.imageUrl,
                is_premium: postsTable.isPremium,
            })
            .from(postsTable)
            .where(eq(postsTable.category, 'Global Markets'))
            .orderBy(desc(postsTable.publishedAt), desc(postsTable.id))
            .limit(11)
            .offset(20);

        expect(await render(query)).toBe(
            'select=id,published_at,title,excerpt,tag,image_url,is_premium'
            + '&category=eq.Global Markets&order=published_at.desc,id.desc&offset=20&limit=11',
        );
    });
});

describe('real-world query shapes — REGRESSION GUARD: scalar eq must never quote its value', () => {
    it('does not wrap a multi-word category value in quotes (production incident)', async () => {
        // Incident: a fix for `or()`/`in()` value encoding was over-applied
        // to plain scalar comparisons (`eq`/`neq`/`gt`/...). PostgREST's
        // `"..."` quoting syntax only exists to delimit multiple values
        // sharing one query parameter (`or=(a.eq."x y",b.eq.z)`,
        // `in.("x y",z)`) — a plain `column=op.value` filter has exactly one
        // value and nothing to delimit, so PostgREST takes it byte-for-byte.
        // Quoting it sent `category=eq."Global Markets"`, which PostgREST
        // read as a request to match the column against the 16-character
        // string `"Global Markets"` — quote marks included — matching no
        // row in the table and returning an empty feed with no error.
        //
        // If this test starts failing with a quoted value on the right, that
        // regression is back: every category/tag/title with a space (or a
        // comma, dot, paren, or embedded quote) will silently return zero
        // rows for every consumer of this package the moment it's published.
        const query = qb.select({ id: postsTable.id }).from(postsTable).where(eq(postsTable.category, 'Global Markets'));
        expect(await render(query)).toBe('select=id&category=eq.Global Markets');
        expect(await render(query)).not.toContain('"Global Markets"');
    });

    it('does not quote any scalar operator value, across a representative sweep', async () => {
        const cases: [ReturnType<typeof eq>, string][] = [
            [eq(postsTable.category, 'Global Markets'), 'category=eq.Global Markets'],
            [eq(postsTable.category, ''), 'category=eq.'],
            [eq(postsTable.category, 'null'), 'category=eq.null'],
            [eq(postsTable.category, 'true'), 'category=eq.true'],
            [eq(postsTable.category, '*wild'), 'category=eq.*wild'],
            [eq(postsTable.category, 'a,b'), 'category=eq.a,b'],
            [eq(postsTable.category, 'a"b'), 'category=eq.a"b'],
        ];
        for (const [where, expected] of cases) {
            const rendered = await render(qb.select({ id: postsTable.id }).from(postsTable).where(where));
            expect(rendered).toBe(`select=id&${expected}`);
        }
    });
});

describe('real-world query shapes — a not-null-and-not-empty filter', () => {
    it('renders isNotNull and ne("") on the same column', async () => {
        const query = qb
            .select({
                id: postsTable.id,
                published_at: postsTable.publishedAt,
                title: postsTable.title,
                excerpt: postsTable.excerpt,
                tag: postsTable.tag,
                image_url: postsTable.imageUrl,
                is_premium: postsTable.isPremium,
            })
            .from(postsTable)
            .where(
                and(
                    eq(postsTable.category, 'Guides'),
                    isNotNull(postsTable.tag),
                    ne(postsTable.tag, ''),
                ),
            )
            .orderBy(asc(postsTable.tag), asc(postsTable.publishedAt), asc(postsTable.id));

        // `ne(col, '')` against the empty string: a plain scalar filter never
        // quotes its value (there is nothing to delimit), so this renders as
        // `tag=neq.` with nothing after the dot — PostgREST's own inherent
        // limitation for scalar filters, not something a client can encode
        // around; only `or()`/`in()` support the quoted-literal syntax that
        // would disambiguate it.
        expect(await render(query)).toBe(
            'select=id,published_at,title,excerpt,tag,image_url,is_premium'
            + '&category=eq.Guides&tag=not.is.null&tag=neq.'
            + '&order=tag.asc,published_at.asc,id.asc',
        );
    });
});

describe('real-world query shapes — a date-bounded single-row lookup', () => {
    it('renders lte against an ISO timestamp with a limit(1)', async () => {
        const query = qb
            .select({
                id: postsTable.id,
                published_at: postsTable.publishedAt,
                title: postsTable.title,
                excerpt: postsTable.excerpt,
                tag: postsTable.tag,
                image_url: postsTable.imageUrl,
                is_premium: postsTable.isPremium,
            })
            .from(postsTable)
            .where(and(eq(postsTable.category, 'Free'), lte(postsTable.publishedAt, '2026-09-11T00:00:00.000Z')))
            .orderBy(desc(postsTable.publishedAt))
            .limit(1);

        expect(await render(query)).toBe(
            'select=id,published_at,title,excerpt,tag,image_url,is_premium'
            + '&category=eq.Free&published_at=lte.2026-09-11T00:00:00.000Z'
            + '&order=published_at.desc&limit=1',
        );
    });
});

describe('real-world query shapes — a not-null-ordered page with an extra lookahead row', () => {
    it('renders isNotNull with a limit one past the page size', async () => {
        const query = qb
            .select({
                name: tagsTable.name,
                section: tagsTable.section,
                sectionRank: tagsTable.sectionRank,
                rank: tagsTable.rank,
            })
            .from(tagsTable)
            .where(isNotNull(tagsTable.sectionRank))
            .orderBy(asc(tagsTable.sectionRank), asc(tagsTable.rank))
            .limit(21)
            .offset(0);

        expect(await render(query)).toBe(
            'select=name,section,section_rank,rank&section_rank=not.is.null'
            + '&order=section_rank.asc,rank.asc&limit=21',
        );
    });
});

describe('real-world query shapes — an inArray filter against caller-controlled-looking values', () => {
    it('renders a list containing a comma and an embedded quote', async () => {
        // Values here stand in for something read out of the database itself
        // (e.g. a distinct list of tag names) and can contain spaces, commas,
        // or quotes — this is exactly the `inArray` shape that needs correct
        // list-value encoding, exercised against untidy values rather than
        // the clean fixtures used elsewhere in this file.
        const tagNames = ['Map Reading', 'Knots, Lashings & Rope', 'Fire "Safety" Basics'];
        const query = qb
            .select({
                id: postsTable.id,
                title: postsTable.title,
                tag: postsTable.tag,
                imageUrl: postsTable.imageUrl,
                isPremium: postsTable.isPremium,
            })
            .from(postsTable)
            .where(and(eq(postsTable.category, 'Guides'), inArray(postsTable.tag, tagNames)))
            .orderBy(asc(postsTable.publishedAt), asc(postsTable.id));

        expect(await render(query)).toBe(
            'select=id,title,tag,image_url,is_premium'
            + '&category=eq.Guides'
            + '&tag=in.("Map Reading","Knots, Lashings & Rope","Fire \\"Safety\\" Basics")'
            + '&order=published_at.asc,id.asc',
        );
    });
});

describe('real-world query shapes — a bare single-column select with no filters', () => {
    it('renders a select with neither where, order, nor limit', async () => {
        const query = qb.select({ postId: readProgressTable.postId }).from(readProgressTable);
        expect(await render(query)).toBe('select=post_id');
    });
});
