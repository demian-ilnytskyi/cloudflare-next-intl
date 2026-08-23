import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import parseComposite from './parse_composite';
import inlineParams from './inline_params';

/**
 * Runs `supabase/cfni_exec.sql` against a real Postgres and drives it
 * exactly the way `supabase_transport.ts` does: build the final statement
 * with `inlineParams`, call `cfni_exec`, and parse each returned row with
 * `parseComposite`. Mocked unit tests (`supabase_transport.test.ts`) cover
 * the transport's own logic; this file is what actually exercises the SQL.
 *
 * Requires a reachable Postgres — set `CFNI_TEST_DATABASE_URL` (e.g.
 * `postgresql://postgres:postgres@127.0.0.1:55432/postgres` from a throwaway
 * `docker run -d -e POSTGRES_PASSWORD=postgres -p 55432:5432 postgres:15`).
 * Skips entirely when unset, so it never affects normal unit test runs/CI
 * without a database available.
 */
const DATABASE_URL = process.env.CFNI_TEST_DATABASE_URL;

describe.skipIf(!DATABASE_URL)('cfni_exec (integration)', () => {
    let client: import('pg').Client;

    async function exec(sql: string, params: unknown[] = []): Promise<{ rows: (string | null)[][]; rowCount: number | null }> {
        const statement = inlineParams(sql, params);
        const result = await client.query('select public.cfni_exec($1) as result', [statement]);
        const { rows, rowCount } = result.rows[0].result as { rows: string[]; rowCount: number | null };
        return { rows: rows.map(parseComposite), rowCount };
    }

    beforeAll(async () => {
        const { Client } = await import('pg');
        client = new Client({ connectionString: DATABASE_URL });
        await client.connect();
        await client.query(`
            do $$
            begin
                if not exists (select 1 from pg_roles where rolname = 'anon') then
                    create role anon;
                end if;
                if not exists (select 1 from pg_roles where rolname = 'authenticated') then
                    create role authenticated;
                end if;
                if not exists (select 1 from pg_roles where rolname = 'service_role') then
                    create role service_role;
                end if;
            end
            $$;
        `);
        const sql = readFileSync(join(__dirname, '../../supabase/cfni_exec.sql'), 'utf-8');
        await client.query(sql);
    }, 30_000);

    afterAll(async () => {
        await client?.end();
    });

    beforeEach(async () => {
        await client.query('drop table if exists cfni_test_a, cfni_test_b cascade');
        await client.query('create table cfni_test_a (id int primary key, name text)');
        await client.query('create table cfni_test_b (id int primary key, name text)');
        await client.query("insert into cfni_test_a values (1, 'a1')");
        await client.query("insert into cfni_test_b values (2, 'b2')");
    });

    it('re-running the install file is idempotent', async () => {
        const sql = readFileSync(join(__dirname, '../../supabase/cfni_exec.sql'), 'utf-8');
        await expect(client.query(sql)).resolves.toBeDefined();
    });

    it('returns jsonb', async () => {
        const result = await client.query("select pg_typeof(public.cfni_exec('select 1')) as t");
        expect(result.rows[0].t).toBe('jsonb');
    });

    it('selects rows with inlined params', async () => {
        const { rows, rowCount } = await exec('select id, name from cfni_test_a where id = $1', [1]);
        expect(rows).toEqual([['1', 'a1']]);
        expect(rowCount).toBe(1);
    });

    it('handles a multi-param query correctly typed (not all bound as text)', async () => {
        const { rows } = await exec('select id, name from cfni_test_a where id = $1 and name = $2', [1, 'a1']);
        expect(rows).toEqual([['1', 'a1']]);
    });

    it('preserves duplicate column names from a join', async () => {
        const { rows } = await exec('select a.*, b.* from cfni_test_a a, cfni_test_b b');
        expect(rows).toEqual([['1', 'a1', '2', 'b2']]);
    });

    it('round-trips array/boolean/numeric/null values as pg text, not JSON', async () => {
        const { rows } = await exec("select array[1,2,3] as arr, true as b, 1.10::numeric as n, null as z, 'hi,there' as s");
        expect(rows).toEqual([['{1,2,3}', 't', '1.10', null, 'hi,there']]);
    });

    it('inserts without returning and reports rowCount with no rows', async () => {
        const { rows, rowCount } = await exec('insert into cfni_test_a (id, name) values ($1, $2)', [10, 'x']);
        expect(rows).toEqual([]);
        expect(rowCount).toBe(1);
    });

    it('inserts with returning', async () => {
        const { rows, rowCount } = await exec('insert into cfni_test_a (id, name) values ($1, $2) returning id, name', [11, 'y']);
        expect(rows).toEqual([['11', 'y']]);
        expect(rowCount).toBe(1);
    });

    it('updates with returning', async () => {
        const { rows } = await exec('update cfni_test_a set name = $1 where id = $2 returning id, name', ['z', 1]);
        expect(rows).toEqual([['1', 'z']]);
    });

    it('updates without returning', async () => {
        const { rows, rowCount } = await exec('update cfni_test_a set name = $1 where id = $2', ['z2', 1]);
        expect(rows).toEqual([]);
        expect(rowCount).toBe(1);
    });

    it('deletes with returning', async () => {
        const { rows } = await exec('delete from cfni_test_a where id = $1 returning id', [1]);
        expect(rows).toEqual([['1']]);
    });

    it('deletes without returning', async () => {
        const { rowCount } = await exec('delete from cfni_test_a where id = $1', [1]);
        expect(rowCount).toBe(1);
    });

    it('supports on conflict do update via excluded', async () => {
        await client.query('alter table cfni_test_a add constraint cfni_test_a_id_uq unique (id)');
        const { rows } = await exec(
            'insert into cfni_test_a (id, name) values ($1, $2) on conflict (id) do update set name = excluded.name returning id, name',
            [1, 'dup'],
        );
        expect(rows).toEqual([['1', 'dup']]);
    });

    it('supports a plain with-select CTE', async () => {
        const { rows } = await exec('with x as (select 1 as v) select v from x');
        expect(rows).toEqual([['1']]);
    });

    it('supports a writable CTE (insert ... select ... returning) at the top level', async () => {
        const { rows } = await exec(
            'with src as (select $1::int as id, $2::text as name) insert into cfni_test_a (id, name) select id, name from src returning id, name',
            [20, 'q'],
        );
        expect(rows).toEqual([['20', 'q']]);
    });

    it('supports a writable CTE wrapped in an outer select', async () => {
        const { rows } = await exec('with u as (update cfni_test_a set name = $1 where id = $2 returning id) select id from u', ['zz', 1]);
        expect(rows).toEqual([['1']]);
    });

    it('does not misclassify a select whose literal text contains the word "returning"', async () => {
        const { rows } = await exec("select 'the returning hero' as s");
        expect(rows).toEqual([['the returning hero']]);
    });

    it('returns an empty result set for no matching rows', async () => {
        const { rows, rowCount } = await exec('select 1 where false');
        expect(rows).toEqual([]);
        expect(rowCount).toBe(0);
    });

    it('enforces row-level security per the invoking role', async () => {
        await client.query('alter table cfni_test_a enable row level security');
        await client.query('drop policy if exists cfni_test_a_select on cfni_test_a');
        await client.query('create policy cfni_test_a_select on cfni_test_a for select to authenticated using (true)');
        await client.query('grant select on cfni_test_a to anon, authenticated');

        await client.query('set role anon');
        const asAnon = await exec('select * from cfni_test_a');
        await client.query('reset role');
        expect(asAnon.rows).toEqual([]);

        await client.query('set role authenticated');
        const asAuthenticated = await exec('select * from cfni_test_a');
        await client.query('reset role');
        expect(asAuthenticated.rows).toEqual([['1', 'a1']]);
    });
});
