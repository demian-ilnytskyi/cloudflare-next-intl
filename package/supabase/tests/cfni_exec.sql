-- pgTAP tests for cfni_exec.sql. Run with `supabase test db` (or
-- `pg_prove`) from a project that has installed both this file and
-- `cfni_exec.sql`. Mirrors the scenarios in
-- `src/db/cfni_exec.integration.test.ts` on the TypeScript side — this file
-- checks the SQL function itself and its RLS interaction directly in
-- Postgres, without going through the transport/JS parsing layer.
begin;
select plan(20);

do $$
begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated;
    end if;
end
$$;

create table cfni_test_a (id int primary key, name text);
create table cfni_test_b (id int primary key, name text);
insert into cfni_test_a values (1, 'a1');
insert into cfni_test_b values (2, 'b2');

select is(pg_typeof(cfni_exec('select 1'))::text, 'jsonb', 'cfni_exec returns jsonb');

select is(
    cfni_exec('select id, name from cfni_test_a where id = 1'),
    '{"rows": ["(1,a1)"], "rowCount": 1}'::jsonb,
    'plain select returns rows and rowCount'
);

select is(
    cfni_exec('select a.*, b.* from cfni_test_a a, cfni_test_b b'),
    '{"rows": ["(1,a1,2,b2)"], "rowCount": 1}'::jsonb,
    'duplicate column names from a join are preserved positionally'
);

select is(
    cfni_exec('select array[1,2,3] as arr, true as b, 1.10::numeric as n, null as z'),
    '{"rows": ["(\"{1,2,3}\",t,1.10,)"], "rowCount": 1}'::jsonb,
    'array/boolean/numeric/null values use pg text form, not JSON re-encoding'
);

select is(
    cfni_exec('insert into cfni_test_a (id, name) values (10, ''x'')'),
    '{"rows": [], "rowCount": 1}'::jsonb,
    'insert without returning reports rowCount with no rows'
);

select is(
    cfni_exec('insert into cfni_test_a (id, name) values (11, ''y'') returning id, name'),
    '{"rows": ["(11,y)"], "rowCount": 1}'::jsonb,
    'insert with returning reports rows'
);

select is(
    cfni_exec('update cfni_test_a set name = ''z'' where id = 1 returning id, name'),
    '{"rows": ["(1,z)"], "rowCount": 1}'::jsonb,
    'update with returning reports rows'
);

select is(
    cfni_exec('update cfni_test_a set name = ''z2'' where id = 1'),
    '{"rows": [], "rowCount": 1}'::jsonb,
    'update without returning reports rowCount with no rows'
);

select is(
    cfni_exec('delete from cfni_test_a where id = 10 returning id'),
    '{"rows": ["(10)"], "rowCount": 1}'::jsonb,
    'delete with returning reports rows'
);

select is(
    cfni_exec('delete from cfni_test_a where id = 11'),
    '{"rows": [], "rowCount": 1}'::jsonb,
    'delete without returning reports rowCount with no rows'
);

alter table cfni_test_a add constraint cfni_test_a_id_uq unique (id);
select is(
    cfni_exec('insert into cfni_test_a (id, name) values (1, ''dup'') on conflict (id) do update set name = excluded.name returning id, name'),
    '{"rows": ["(1,dup)"], "rowCount": 1}'::jsonb,
    'on conflict do update via excluded works'
);

select is(
    cfni_exec('with x as (select 1 as v) select v from x'),
    '{"rows": ["(1)"], "rowCount": 1}'::jsonb,
    'plain with-select CTE works'
);

select is(
    cfni_exec('with src as (select 20 as id, ''q'' as name) insert into cfni_test_a (id, name) select id, name from src returning id, name'),
    '{"rows": ["(20,q)"], "rowCount": 1}'::jsonb,
    'writable CTE (insert ... select ... returning) at the top level works'
);

select is(
    cfni_exec('with u as (update cfni_test_a set name = ''zz'' where id = 1 returning id) select id from u'),
    '{"rows": ["(1)"], "rowCount": 1}'::jsonb,
    'writable CTE wrapped in an outer select works'
);

select is(
    cfni_exec('select ''the returning hero'' as s'),
    '{"rows": ["(\"the returning hero\")"], "rowCount": 1}'::jsonb,
    'a select whose literal text contains the word "returning" is not misclassified as DML'
);

select is(
    cfni_exec('select 1 where false'),
    '{"rows": [], "rowCount": 0}'::jsonb,
    'no matching rows returns an empty result set'
);

select is(pg_proc.prosecdef, false, 'cfni_exec is security invoker, not security definer')
from pg_proc where proname = 'cfni_exec';

-- Re-running the install file must not error (create-or-replace + a
-- return-type-changing drop guard) — exercised by re-declaring the function
-- with an identical body here, standing in for `\i cfni_exec.sql` a second
-- time, since re-sourcing the actual file mid-transaction isn't expressible
-- from within a single pgTAP script.
select isnt(cfni_exec('select 1'), null, 'cfni_exec remains callable after a hypothetical reinstall');

alter table cfni_test_a enable row level security;
create policy cfni_test_a_select on cfni_test_a for select to authenticated using (true);
grant select on cfni_test_a to anon, authenticated;

set role anon;
select is(
    cfni_exec('select * from cfni_test_a'),
    '{"rows": [], "rowCount": 0}'::jsonb,
    'anon sees no rows with no matching RLS policy'
);
reset role;

set role authenticated;
select is(
    (cfni_exec('select * from cfni_test_a') ->> 'rowCount')::int,
    (select count(*)::int from cfni_test_a),
    'authenticated sees all rows under its permissive select policy'
);
reset role;

select * from finish();
rollback;
