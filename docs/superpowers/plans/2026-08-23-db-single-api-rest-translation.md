# Single `db` API with Automatic PostgREST Translation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consumers get exactly one data-access API — `withPublicDb`/`withUserDb` with a Drizzle handle — and the package silently routes each generated statement to `cfni_exec` or, when raw SQL is unavailable, to translated `@supabase/supabase-js` `.from()` calls; genuinely untranslatable constructs raise a precise error.

**Architecture:** In Supabase mode the `drizzle-orm/pg-proxy` transport gains a translation layer in front of `cfni_exec`. Each generated statement is tokenized and parsed into a small `ParsedStatement` union (single-table SELECT/INSERT/UPDATE/DELETE, with `on conflict` and `returning`). Translatable statements execute through a PostgREST query builder and are re-shaped into the positional-array rows `pg-proxy` expects. `UnsupportedSqlError` from the parser falls back to `cfni_exec` when raw SQL is allowed, and otherwise surfaces to the caller naming the offending construct. All `supabaseSelect`/`supabaseInsert`/`supabaseUpsert`/`supabaseUpdate`/`supabaseDelete`/`supabaseRpc` exports (and `*AsUser`) are deleted; their client factory and builder typings are kept as package internals. A shipped ESLint config fragment forbids consumer code from importing `@supabase/supabase-js` or package internals directly.

**Tech Stack:** TypeScript (strict), `drizzle-orm/pg-proxy`, `@supabase/supabase-js` (dynamic import only), vitest + v8 coverage, ESLint flat config.

**Spec:** this document, § Spec (below).

## Spec

1. Public surface of `cloudflare-next-intl/db` after this change: `withPublicDb`, `withUserDb`, `connectToPostgres`, `disconnectPostgres`, `resetConnectionState`, types `DrizzleDb`, `DbRoutingConfig`. Nothing else.
2. A consumer writes the same Drizzle code regardless of transport (`connectionString`, Supabase + `cfni_exec`, Supabase without `cfni_exec`). The package chooses.
3. In Supabase mode:
   - Parse the statement. If it fits the supported subset, run it via `.from(table)` PostgREST calls.
   - If it does not fit and `db.supabase.rawSql !== false`, run it via `cfni_exec` (today's behaviour).
   - If it does not fit and `rawSql === false`, throw an error that names the unsupported construct and states the two ways forward (install `cfni_exec` / use `db.connectionString`).
4. `.transaction()` in Supabase mode keeps throwing its existing explicit error.
5. Supported subset (v1), single table only, no aliases, no joins, no CTEs, no sub-selects, no aggregates, no `group by`/`having`/`distinct`/`union`:
   - `select <cols> from "t" [where …] [order by …] [limit n] [offset n]`
   - `insert into "t" ("a","b") values (…)[,(…)] [on conflict ("a"[,…]) do nothing | do update set "b" = excluded."b"…] [returning <cols>]`
   - `update "t" set "a" = <val>… where … [returning <cols>]`
   - `delete from "t" where … [returning <cols>]`
   - `where` operators, core set (Tasks 3/6): `=`, `<>`/`!=`, `>`, `>=`, `<`, `<=`, `like`, `ilike`, `is null`, `is not null`, `in (…)`, `not (…)`, `and`, `or`.
   - `where` operators, extended set (Task 13 — brings coverage up to everything `@supabase/postgrest-js` can express, since `supabase.from()` *is* a postgrest-js builder): `~` → `regexMatch`, `~*` → `regexIMatch`, `@>` → `contains`, `<@` → `containedBy`, `&&` → `overlaps`, `>>`/`<<`/`&>`/`&<`/`-|-` → `rangeGt`/`rangeLt`/`rangeGte`/`rangeLte`/`rangeAdjacent`, `@@ to_tsquery/plainto_tsquery/phraseto_tsquery/websearch_to_tsquery` → `textSearch`, `is distinct from` → `isDistinct`, `not in (…)` → `not(col,'in',…)`.
   - Aggregate-only projection `count(*)` (optionally aliased) → `select('', { count: 'exact', head: true })` (Task 13).
6a. Not reachable through PostgREST at all, and therefore always `UnsupportedSqlError` (→ `cfni_exec`, or `db.connectionString`): joins/multi-table statements, sub-selects, CTEs, `group by`/`having`, `distinct`, set operations, window functions, expressions in the projection or on the left side of a filter, aggregates other than a lone `count(*)`, `.transaction()`.
6. Rows returned to `pg-proxy` are positional arrays ordered by the statement's projection list; a statement with no projection (`execute`, no `returning`) returns `{ rows: [], rowCount }`.
7. `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` resolution, bearer-token/identity behaviour, and error-code messaging (`PGRST202`, `PGRST301`, `42501`) are unchanged.
8. `@supabase/supabase-js`, `pg`, and `drizzle-orm` stay behind dynamic `import()`; no new runtime dependency is added.

## Global Constraints

- Package source lives in `package/src/**`; tests are colocated `<name>.test.ts`. No `__tests__` tree.
- Coverage thresholds are 100% per file globally, with only the two sanctioned exceptions in `package/vitest.config.ts`. Every new file must reach 100% statements/branches/functions/lines. Never add `/* v8 ignore */` to production source.
- Run tests with `cd package && npm test`.
- No comments explaining *what* code does; JSDoc on every exported symbol, explaining *why* and documenting `@param`/`@returns`/`@throws`, matching the existing `package/src/db/*.ts` style.
- Files under `package/src/db/` never statically import `@supabase/supabase-js` or `drizzle-orm`; use structural types plus dynamic `import()`.
- 4-space indentation, single quotes, semicolons (match `package/src/db/context.ts`).
- Conventional Commit messages (`feat:`, `refactor:`, `test:`, `docs:`, `chore:`).
- Public API changes must be reflected in `package/README.md`, `package/llms.txt`, `package/CHANGELOG.md`, and the JSDoc of `package/src/types/types.ts`'s `SupabaseDbConfig`.

## File Structure

**Create**
- `package/src/db/sql_tokens.ts` — SQL tokenizer producing a flat token list (identifiers, keywords, placeholders, literals, punctuation).
- `package/src/db/unsupported_sql.ts` — `UnsupportedSqlError` class.
- `package/src/db/parse_statement.ts` — token list → `ParsedStatement` union; throws `UnsupportedSqlError`.
- `package/src/db/parse_where.ts` — the `where`-clause sub-parser shared by select/update/delete.
- `package/src/db/rest_filters.ts` — `WhereNode` → PostgREST builder calls / `or()` filter strings.
- `package/src/db/rest_client.ts` — creates and memoizes the `@supabase/supabase-js` client for a given config + bearer token (moved out of `supabase_rest.ts`).
- `package/src/db/rest_execute.ts` — `ParsedStatement` + params + client → `{ rows, rowCount }` in `pg-proxy` shape.
- `package/src/db/eslint_config.ts` — exported ESLint flat-config fragment.

**Modify**
- `package/src/db/supabase_transport.ts` — try translation first, fall back to `cfni_exec`, honour `rawSql === false`.
- `package/src/db/context.ts` — drop `requireRawSql`; the transport now decides.
- `package/src/db/index.ts` — remove the `supabase*` exports and their types.
- `package/src/types/types.ts` — rewrite `rawSql` JSDoc.
- `package/package.json` — add the `./dbEslint` export.
- `package/README.md`, `package/llms.txt`, `package/CHANGELOG.md` — public-API docs.
- `.agent/.sub-rules/packages/` — add `db.md` describing the db module for future agents.

**Delete**
- `package/src/db/supabase_rest.ts` and `package/src/db/supabase_rest.test.ts` (builder typings move into `rest_client.ts`, client creation too).

---

### Task 1: SQL tokenizer

**Files:**
- Create: `package/src/db/sql_tokens.ts`
- Test: `package/src/db/sql_tokens.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `export type SqlToken = { kind: 'word'; value: string } | { kind: 'quoted'; value: string } | { kind: 'string'; value: string } | { kind: 'number'; value: string } | { kind: 'param'; index: number } | { kind: 'punct'; value: string }` and `export default function tokenizeSql(sql: string): SqlToken[]`.
  - `word` values are lowercased (keywords and unquoted identifiers); `quoted` keeps the inner text of `"…"` verbatim with `""` collapsed to `"`; `string` keeps the inner text of `'…'` with `''` collapsed to `'`; `punct` is one of `( ) , . * = <> != < <= > >= + -` (multi-char operators are single tokens); comments and whitespace are dropped.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import tokenizeSql from './sql_tokens';

describe('tokenizeSql', () => {
    it('tokenizes a drizzle-shaped select', () => {
        expect(tokenizeSql('select "users"."id" from "users" where "users"."id" = $1 limit 10')).toEqual([
            { kind: 'word', value: 'select' },
            { kind: 'quoted', value: 'users' },
            { kind: 'punct', value: '.' },
            { kind: 'quoted', value: 'id' },
            { kind: 'word', value: 'from' },
            { kind: 'quoted', value: 'users' },
            { kind: 'word', value: 'where' },
            { kind: 'quoted', value: 'users' },
            { kind: 'punct', value: '.' },
            { kind: 'quoted', value: 'id' },
            { kind: 'punct', value: '=' },
            { kind: 'param', index: 1 },
            { kind: 'word', value: 'limit' },
            { kind: 'number', value: '10' },
        ]);
    });

    it('lowercases bare words and keeps quoted identifiers verbatim', () => {
        expect(tokenizeSql('SELECT * FROM "Users"')).toEqual([
            { kind: 'word', value: 'select' },
            { kind: 'punct', value: '*' },
            { kind: 'word', value: 'from' },
            { kind: 'quoted', value: 'Users' },
        ]);
    });

    it('reads multi-character operators as one token', () => {
        expect(tokenizeSql('a <> b >= c <= d != e')).toEqual([
            { kind: 'word', value: 'a' },
            { kind: 'punct', value: '<>' },
            { kind: 'word', value: 'b' },
            { kind: 'punct', value: '>=' },
            { kind: 'word', value: 'c' },
            { kind: 'punct', value: '<=' },
            { kind: 'word', value: 'd' },
            { kind: 'punct', value: '!=' },
            { kind: 'word', value: 'e' },
        ]);
    });

    it('unescapes doubled quotes in identifiers and strings', () => {
        expect(tokenizeSql(`"we""ird" 'it''s'`)).toEqual([
            { kind: 'quoted', value: 'we"ird' },
            { kind: 'string', value: "it's" },
        ]);
    });

    it('drops line and block comments and extra whitespace', () => {
        expect(tokenizeSql('select -- one\n /* two */ *')).toEqual([
            { kind: 'word', value: 'select' },
            { kind: 'punct', value: '*' },
        ]);
    });

    it('reads unterminated comments, strings and identifiers to end of input', () => {
        expect(tokenizeSql('select /* never closed')).toEqual([{ kind: 'word', value: 'select' }]);
        expect(tokenizeSql("'open")).toEqual([{ kind: 'string', value: 'open' }]);
        expect(tokenizeSql('"open')).toEqual([{ kind: 'quoted', value: 'open' }]);
    });

    it('reads decimal numbers and unknown characters as punct', () => {
        expect(tokenizeSql('1.5 ;')).toEqual([
            { kind: 'number', value: '1.5' },
            { kind: 'punct', value: ';' },
        ]);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd package && npx vitest run src/db/sql_tokens.test.ts`
Expected: FAIL — `Failed to resolve import "./sql_tokens"`.

- [ ] **Step 3: Write minimal implementation**

```ts
/** One lexical unit of a generated SQL statement. */
export type SqlToken =
    | { kind: 'word'; value: string }
    | { kind: 'quoted'; value: string }
    | { kind: 'string'; value: string }
    | { kind: 'number'; value: string }
    | { kind: 'param'; index: number }
    | { kind: 'punct'; value: string };

const MULTI_CHAR_OPERATORS = ['<>', '!=', '>=', '<='];

/**
 * Splits a statement generated by `drizzle-orm/pg-proxy` into tokens the
 * statement parser can walk.
 *
 * Bare words are lowercased so keyword matching downstream never has to care
 * about Drizzle's casing, while `"quoted"` identifiers keep their exact text —
 * Postgres treats those as case-sensitive and PostgREST needs them verbatim.
 * Comments and whitespace are dropped; nothing here validates grammar.
 *
 * @param sql The generated statement text, `$n` placeholders included.
 * @returns The token list, in source order.
 */
export default function tokenizeSql(sql: string): SqlToken[] {
    const tokens: SqlToken[] = [];
    let i = 0;

    while (i < sql.length) {
        const char = sql[i]!;

        if (/\s/.test(char)) {
            i++;
            continue;
        }

        if (char === '-' && sql[i + 1] === '-') {
            const end = sql.indexOf('\n', i);
            i = end === -1 ? sql.length : end + 1;
            continue;
        }

        if (char === '/' && sql[i + 1] === '*') {
            const end = sql.indexOf('*/', i + 2);
            i = end === -1 ? sql.length : end + 2;
            continue;
        }

        if (char === '"') {
            const [value, next] = readDelimited(sql, i + 1, '"');
            tokens.push({ kind: 'quoted', value });
            i = next;
            continue;
        }

        if (char === "'") {
            const [value, next] = readDelimited(sql, i + 1, "'");
            tokens.push({ kind: 'string', value });
            i = next;
            continue;
        }

        if (char === '$' && /[0-9]/.test(sql[i + 1] ?? '')) {
            let end = i + 1;
            while (end < sql.length && /[0-9]/.test(sql[end]!)) end++;
            tokens.push({ kind: 'param', index: Number(sql.slice(i + 1, end)) });
            i = end;
            continue;
        }

        if (/[0-9]/.test(char)) {
            let end = i;
            while (end < sql.length && /[0-9.]/.test(sql[end]!)) end++;
            tokens.push({ kind: 'number', value: sql.slice(i, end) });
            i = end;
            continue;
        }

        if (/[A-Za-z_]/.test(char)) {
            let end = i;
            while (end < sql.length && /[A-Za-z0-9_]/.test(sql[end]!)) end++;
            tokens.push({ kind: 'word', value: sql.slice(i, end).toLowerCase() });
            i = end;
            continue;
        }

        const operator = MULTI_CHAR_OPERATORS.find((candidate) => sql.startsWith(candidate, i));
        if (operator) {
            tokens.push({ kind: 'punct', value: operator });
            i += operator.length;
            continue;
        }

        tokens.push({ kind: 'punct', value: char });
        i++;
    }

    return tokens;
}

function readDelimited(sql: string, from: number, delimiter: string): [string, number] {
    let value = '';
    let i = from;
    while (i < sql.length) {
        if (sql[i] === delimiter) {
            if (sql[i + 1] === delimiter) {
                value += delimiter;
                i += 2;
                continue;
            }
            return [value, i + 1];
        }
        value += sql[i];
        i++;
    }
    return [value, sql.length];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd package && npx vitest run src/db/sql_tokens.test.ts --coverage.enabled=false`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add package/src/db/sql_tokens.ts package/src/db/sql_tokens.test.ts
git commit -m "feat: tokenize generated SQL for PostgREST translation"
```

---

### Task 2: `UnsupportedSqlError`

**Files:**
- Create: `package/src/db/unsupported_sql.ts`
- Test: `package/src/db/unsupported_sql.test.ts`

**Interfaces:**
- Produces: `export default class UnsupportedSqlError extends Error { readonly construct: string; constructor(construct: string) }` — `message` is `` `db: this query cannot be expressed through the Supabase REST API (${construct}).` ``.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import UnsupportedSqlError from './unsupported_sql';

describe('UnsupportedSqlError', () => {
    it('names the offending construct in the message', () => {
        const error = new UnsupportedSqlError('join');
        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe('UnsupportedSqlError');
        expect(error.construct).toBe('join');
        expect(error.message).toBe('db: this query cannot be expressed through the Supabase REST API (join).');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd package && npx vitest run src/db/unsupported_sql.test.ts`
Expected: FAIL — cannot resolve `./unsupported_sql`.

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * Raised by the statement parser and REST executor when a generated
 * statement uses something PostgREST's single-table API cannot express.
 *
 * The transport catches this specific type to decide between falling back to
 * `cfni_exec` and reporting the limitation to the caller, so it must stay
 * distinguishable from a genuine query failure.
 */
export default class UnsupportedSqlError extends Error {
    /** Short name of the construct that could not be translated. */
    readonly construct: string;

    /**
     * @param construct Short name of the unsupported construct, e.g. `'join'`.
     */
    constructor(construct: string) {
        super(`db: this query cannot be expressed through the Supabase REST API (${construct}).`);
        this.name = 'UnsupportedSqlError';
        this.construct = construct;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd package && npx vitest run src/db/unsupported_sql.test.ts --coverage.enabled=false`
Expected: PASS, 1 test.

- [ ] **Step 5: Commit**

```bash
git add package/src/db/unsupported_sql.ts package/src/db/unsupported_sql.test.ts
git commit -m "feat: add UnsupportedSqlError for untranslatable statements"
```

---

### Task 3: `where`-clause parser

**Files:**
- Create: `package/src/db/parse_where.ts`
- Test: `package/src/db/parse_where.test.ts`

**Interfaces:**
- Consumes: `tokenizeSql`/`SqlToken` (Task 1), `UnsupportedSqlError` (Task 2).
- Produces:
  ```ts
  export type SqlValue = { kind: 'param'; index: number } | { kind: 'literal'; value: string | number | boolean | null };
  export type WhereNode =
      | { kind: 'and' | 'or'; children: WhereNode[] }
      | { kind: 'not'; child: WhereNode }
      | { kind: 'compare'; column: string; operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike'; value: SqlValue }
      | { kind: 'is'; column: string; negated: boolean }
      | { kind: 'in'; column: string; values: SqlValue[] };
  export interface WhereParse { node: WhereNode; next: number }
  export default function parseWhere(tokens: SqlToken[], start: number): WhereParse;
  ```
  `start` is the index of the first token after `where`; `next` is the index of the first token the parser did not consume (`order`, `limit`, `returning`, or `tokens.length`).

- [ ] **Step 1: Write the failing test**

```ts
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

    it('parses literals, including negative numbers, booleans and strings', () => {
        expect(parse("\"a\" = 'x'").node).toMatchObject({ value: { kind: 'literal', value: 'x' } });
        expect(parse('"a" = 5').node).toMatchObject({ value: { kind: 'literal', value: 5 } });
        expect(parse('"a" = -5').node).toMatchObject({ value: { kind: 'literal', value: -5 } });
        expect(parse('"a" = true').node).toMatchObject({ value: { kind: 'literal', value: true } });
        expect(parse('"a" = false').node).toMatchObject({ value: { kind: 'literal', value: false } });
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
        expect(() => parse('("a" = $1')).toThrow(UnsupportedSqlError);
        expect(() => parse('')).toThrow(UnsupportedSqlError);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd package && npx vitest run src/db/parse_where.test.ts`
Expected: FAIL — cannot resolve `./parse_where`.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { SqlToken } from './sql_tokens';
import UnsupportedSqlError from './unsupported_sql';

/** A value in a parsed clause: a `$n` placeholder or an inline literal. */
export type SqlValue =
    | { kind: 'param'; index: number }
    | { kind: 'literal'; value: string | number | boolean | null };

/** PostgREST-expressible comparison operators. */
export type CompareOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike';

/** One node of a parsed `where` tree. */
export type WhereNode =
    | { kind: 'and' | 'or'; children: WhereNode[] }
    | { kind: 'not'; child: WhereNode }
    | { kind: 'compare'; column: string; operator: CompareOperator; value: SqlValue }
    | { kind: 'is'; column: string; negated: boolean }
    | { kind: 'in'; column: string; values: SqlValue[] };

/** A parsed `where` tree plus the index the caller should resume from. */
export interface WhereParse {
    node: WhereNode;
    next: number;
}

const OPERATORS: Record<string, CompareOperator> = {
    '=': 'eq',
    '<>': 'neq',
    '!=': 'neq',
    '>': 'gt',
    '>=': 'gte',
    '<': 'lt',
    '<=': 'lte',
};

const CLAUSE_TERMINATORS = new Set(['order', 'limit', 'offset', 'returning', 'group', 'having', 'window', 'union', 'on']);

/**
 * Parses the boolean expression after `where` into a tree the REST layer can
 * map onto PostgREST filters.
 *
 * Only column-versus-value comparisons are accepted: PostgREST filters address
 * one column against one value, so function calls, column-to-column
 * comparisons, and subqueries are rejected here rather than mistranslated.
 *
 * @param tokens The full token list of the statement.
 * @param start Index of the first token after `where`.
 * @returns The parsed tree and the index of the first unconsumed token.
 * @throws {UnsupportedSqlError} If the expression uses anything outside the
 * supported subset.
 */
export default function parseWhere(tokens: SqlToken[], start: number): WhereParse {
    const parsed = parseOr(tokens, start);
    return parsed;
}

function parseOr(tokens: SqlToken[], start: number): WhereParse {
    const children: WhereNode[] = [];
    let index = start;
    for (;;) {
        const parsed = parseAnd(tokens, index);
        children.push(parsed.node);
        index = parsed.next;
        if (!isWord(tokens[index], 'or')) break;
        index++;
    }
    return { node: children.length === 1 ? children[0]! : { kind: 'or', children }, next: index };
}

function parseAnd(tokens: SqlToken[], start: number): WhereParse {
    const children: WhereNode[] = [];
    let index = start;
    for (;;) {
        const parsed = parseUnary(tokens, index);
        children.push(parsed.node);
        index = parsed.next;
        if (!isWord(tokens[index], 'and')) break;
        index++;
    }
    return { node: children.length === 1 ? children[0]! : { kind: 'and', children }, next: index };
}

function parseUnary(tokens: SqlToken[], start: number): WhereParse {
    if (isWord(tokens[start], 'not')) {
        const parsed = parseUnary(tokens, start + 1);
        return { node: { kind: 'not', child: parsed.node }, next: parsed.next };
    }
    if (isPunct(tokens[start], '(')) {
        const parsed = parseOr(tokens, start + 1);
        if (!isPunct(tokens[parsed.next], ')')) throw new UnsupportedSqlError('unbalanced parentheses in where');
        return { node: parsed.node, next: parsed.next + 1 };
    }
    return parseComparison(tokens, start);
}

function parseComparison(tokens: SqlToken[], start: number): WhereParse {
    let index = start;
    const column = readColumn(tokens, index);
    index = column.next;

    const token = tokens[index];
    if (isWord(token, 'is')) {
        index++;
        let negated = false;
        if (isWord(tokens[index], 'not')) {
            negated = true;
            index++;
        }
        if (!isWord(tokens[index], 'null')) throw new UnsupportedSqlError('`is` against a non-null value');
        return { node: { kind: 'is', column: column.name, negated }, next: index + 1 };
    }

    if (isWord(token, 'in')) {
        index++;
        if (!isPunct(tokens[index], '(')) throw new UnsupportedSqlError('`in` without a value list');
        index++;
        const values: SqlValue[] = [];
        for (;;) {
            const value = readValue(tokens, index);
            values.push(value.value);
            index = value.next;
            if (isPunct(tokens[index], ',')) {
                index++;
                continue;
            }
            break;
        }
        if (!isPunct(tokens[index], ')')) throw new UnsupportedSqlError('unterminated `in` value list');
        return { node: { kind: 'in', column: column.name, values }, next: index + 1 };
    }

    if (isWord(token, 'like') || isWord(token, 'ilike')) {
        const operator = (token as { value: string }).value as 'like' | 'ilike';
        const value = readValue(tokens, index + 1);
        return { node: { kind: 'compare', column: column.name, operator, value: value.value }, next: value.next };
    }

    if (token?.kind === 'punct' && OPERATORS[token.value]) {
        const value = readValue(tokens, index + 1);
        return {
            node: { kind: 'compare', column: column.name, operator: OPERATORS[token.value]!, value: value.value },
            next: value.next,
        };
    }

    throw new UnsupportedSqlError(`unsupported operator in where near "${describe(token)}"`);
}

function readColumn(tokens: SqlToken[], start: number): { name: string; next: number } {
    const token = tokens[start];
    if (!token || (token.kind !== 'quoted' && token.kind !== 'word')) {
        throw new UnsupportedSqlError(`expected a column in where near "${describe(token)}"`);
    }
    if (token.kind === 'word' && CLAUSE_TERMINATORS.has(token.value)) {
        throw new UnsupportedSqlError(`expected a column in where near "${token.value}"`);
    }
    if (isPunct(tokens[start + 1], '(')) throw new UnsupportedSqlError(`function call in where ("${token.value}")`);
    if (isPunct(tokens[start + 1], '.')) {
        const column = tokens[start + 2];
        if (!column || (column.kind !== 'quoted' && column.kind !== 'word')) {
            throw new UnsupportedSqlError('expected a column after a table qualifier in where');
        }
        return { name: column.value, next: start + 3 };
    }
    return { name: token.value, next: start + 1 };
}

function readValue(tokens: SqlToken[], start: number): { value: SqlValue; next: number } {
    const token = tokens[start];
    if (!token) throw new UnsupportedSqlError('missing value in where');
    if (token.kind === 'param') return { value: { kind: 'param', index: token.index }, next: start + 1 };
    if (token.kind === 'string') return { value: { kind: 'literal', value: token.value }, next: start + 1 };
    if (token.kind === 'number') return { value: { kind: 'literal', value: Number(token.value) }, next: start + 1 };
    if (isPunct(token, '-') && tokens[start + 1]?.kind === 'number') {
        return { value: { kind: 'literal', value: -Number((tokens[start + 1] as { value: string }).value) }, next: start + 2 };
    }
    if (token.kind === 'word' && (token.value === 'true' || token.value === 'false')) {
        return { value: { kind: 'literal', value: token.value === 'true' }, next: start + 1 };
    }
    if (token.kind === 'word' && token.value === 'null') return { value: { kind: 'literal', value: null }, next: start + 1 };
    throw new UnsupportedSqlError(`unsupported value in where near "${describe(token)}"`);
}

function isWord(token: SqlToken | undefined, value: string): boolean {
    return token?.kind === 'word' && token.value === value;
}

function isPunct(token: SqlToken | undefined, value: string): boolean {
    return token?.kind === 'punct' && token.value === value;
}

function describe(token: SqlToken | undefined): string {
    if (!token) return 'end of statement';
    return token.kind === 'param' ? `$${token.index}` : token.value;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd package && npx vitest run src/db/parse_where.test.ts --coverage.enabled=false`
Expected: PASS, 8 tests.

- [ ] **Step 5: Check per-file coverage and add tests for any uncovered branch**

Run: `cd package && npx vitest run src/db/parse_where.test.ts --coverage.include='src/db/parse_where.ts'`
Expected: 100% statements/branches/functions/lines. If a branch is uncovered, add a case to the "rejects constructs" test (each `throw` needs one) and re-run.

- [ ] **Step 6: Commit**

```bash
git add package/src/db/parse_where.ts package/src/db/parse_where.test.ts
git commit -m "feat: parse where clauses into a PostgREST-mappable tree"
```

---

### Task 4: statement parser — SELECT

**Files:**
- Create: `package/src/db/parse_statement.ts`
- Test: `package/src/db/parse_statement.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  ```ts
  export interface Projection { column: string; alias?: string }
  export interface OrderBy { column: string; ascending: boolean; nullsFirst?: boolean }
  export interface ParsedSelect {
      kind: 'select';
      table: string;
      projection: Projection[] | 'all';
      where?: WhereNode;
      orderBy: OrderBy[];
      limit?: SqlValue;
      offset?: SqlValue;
  }
  export type ParsedStatement = ParsedSelect;   // widened in Task 5
  export default function parseStatement(sql: string): ParsedStatement;
  ```

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd package && npx vitest run src/db/parse_statement.test.ts`
Expected: FAIL — cannot resolve `./parse_statement`.

- [ ] **Step 3: Write minimal implementation**

```ts
import tokenizeSql, { type SqlToken } from './sql_tokens';
import parseWhere, { type SqlValue, type WhereNode } from './parse_where';
import UnsupportedSqlError from './unsupported_sql';

/** One selected/returned column, with its output name when aliased. */
export interface Projection {
    column: string;
    alias?: string;
}

/** One `order by` term. */
export interface OrderBy {
    column: string;
    ascending: boolean;
    nullsFirst?: boolean;
}

/** A single-table `select` reduced to what PostgREST can express. */
export interface ParsedSelect {
    kind: 'select';
    table: string;
    projection: Projection[] | 'all';
    where?: WhereNode;
    orderBy: OrderBy[];
    limit?: SqlValue;
    offset?: SqlValue;
}

/** Any statement the REST executor knows how to run. */
export type ParsedStatement = ParsedSelect;

/**
 * Parses a generated statement into the smallest description the REST
 * executor needs, rejecting anything PostgREST's single-table API cannot do.
 *
 * The parser is deliberately strict: a statement it does not fully understand
 * must raise rather than translate approximately, because the transport reads
 * a raise as "send this to `cfni_exec` instead" and a wrong translation would
 * silently return wrong rows.
 *
 * @param sql The generated statement text, `$n` placeholders included.
 * @returns The parsed statement.
 * @throws {UnsupportedSqlError} If the statement is outside the supported subset.
 */
export default function parseStatement(sql: string): ParsedStatement {
    const tokens = tokenizeSql(sql);
    const first = tokens[0];
    if (!first || first.kind !== 'word') throw new UnsupportedSqlError('empty statement');
    if (first.value === 'select') return parseSelect(tokens);
    throw new UnsupportedSqlError(`statement type "${first.value}"`);
}

function parseSelect(tokens: SqlToken[]): ParsedSelect {
    let index = 1;
    if (isWord(tokens[index], 'distinct')) throw new UnsupportedSqlError('select distinct');

    const projection = parseProjection(tokens, index);
    index = projection.next;

    if (!isWord(tokens[index], 'from')) throw new UnsupportedSqlError('select without a plain `from`');
    index++;

    const table = readIdentifier(tokens, index, 'table name');
    index = table.next;
    if (tokens[index]?.kind === 'quoted' || (tokens[index]?.kind === 'word' && !isClauseKeyword(tokens[index]!))) {
        throw new UnsupportedSqlError('table alias');
    }
    if (isPunct(tokens[index], ',')) throw new UnsupportedSqlError('multiple tables in `from`');

    const select: ParsedSelect = { kind: 'select', table: table.name, projection: projection.value, orderBy: [] };

    if (isWord(tokens[index], 'where')) {
        const parsed = parseWhere(tokens, index + 1);
        select.where = parsed.node;
        index = parsed.next;
    }

    if (isWord(tokens[index], 'order')) {
        const parsed = parseOrderBy(tokens, index);
        select.orderBy = parsed.value;
        index = parsed.next;
    }

    if (isWord(tokens[index], 'limit')) {
        const value = readValueToken(tokens, index + 1);
        select.limit = value.value;
        index = value.next;
    }

    if (isWord(tokens[index], 'offset')) {
        const value = readValueToken(tokens, index + 1);
        select.offset = value.value;
        index = value.next;
    }

    if (index < tokens.length) throw new UnsupportedSqlError(`trailing clause near "${describe(tokens[index])}"`);
    return select;
}

function parseProjection(tokens: SqlToken[], start: number): { value: Projection[] | 'all'; next: number } {
    if (isPunct(tokens[start], '*') && isWord(tokens[start + 1], 'from')) return { value: 'all', next: start + 1 };

    const projections: Projection[] = [];
    let index = start;
    for (;;) {
        const column = readProjectionColumn(tokens, index);
        projections.push(column.value);
        index = column.next;
        if (isPunct(tokens[index], ',')) {
            index++;
            continue;
        }
        break;
    }
    return { value: projections, next: index };
}

function readProjectionColumn(tokens: SqlToken[], start: number): { value: Projection; next: number } {
    const token = tokens[start];
    if (!token || (token.kind !== 'quoted' && token.kind !== 'word')) {
        throw new UnsupportedSqlError(`unsupported projection near "${describe(token)}"`);
    }
    if (isPunct(tokens[start + 1], '(')) throw new UnsupportedSqlError(`expression in projection ("${token.value}")`);

    let index = start + 1;
    let column = token.value;
    if (isPunct(tokens[index], '.')) {
        const qualified = tokens[index + 1];
        if (!qualified || (qualified.kind !== 'quoted' && qualified.kind !== 'word')) {
            throw new UnsupportedSqlError('unsupported qualified projection');
        }
        column = qualified.value;
        index += 2;
    }

    if (isWord(tokens[index], 'as')) {
        const alias = readIdentifier(tokens, index + 1, 'projection alias');
        return { value: { column, alias: alias.name }, next: alias.next };
    }
    return { value: { column }, next: index };
}

function parseOrderBy(tokens: SqlToken[], start: number): { value: OrderBy[]; next: number } {
    if (!isWord(tokens[start + 1], 'by')) throw new UnsupportedSqlError('`order` without `by`');
    let index = start + 2;
    const terms: OrderBy[] = [];
    for (;;) {
        const column = readProjectionColumn(tokens, index);
        if (column.value.alias) throw new UnsupportedSqlError('alias in `order by`');
        index = column.next;
        const term: OrderBy = { column: column.value.column, ascending: true };
        if (isWord(tokens[index], 'asc') || isWord(tokens[index], 'desc')) {
            term.ascending = isWord(tokens[index], 'asc');
            index++;
        }
        if (isWord(tokens[index], 'nulls')) {
            if (isWord(tokens[index + 1], 'first')) term.nullsFirst = true;
            else if (isWord(tokens[index + 1], 'last')) term.nullsFirst = false;
            else throw new UnsupportedSqlError('`nulls` without `first`/`last`');
            index += 2;
        }
        terms.push(term);
        if (isPunct(tokens[index], ',')) {
            index++;
            continue;
        }
        break;
    }
    return { value: terms, next: index };
}

function readValueToken(tokens: SqlToken[], start: number): { value: SqlValue; next: number } {
    const token = tokens[start];
    if (token?.kind === 'param') return { value: { kind: 'param', index: token.index }, next: start + 1 };
    if (token?.kind === 'number') return { value: { kind: 'literal', value: Number(token.value) }, next: start + 1 };
    throw new UnsupportedSqlError(`expected a number or placeholder near "${describe(token)}"`);
}

function readIdentifier(tokens: SqlToken[], start: number, what: string): { name: string; next: number } {
    const token = tokens[start];
    if (!token || (token.kind !== 'quoted' && token.kind !== 'word')) {
        throw new UnsupportedSqlError(`expected a ${what} near "${describe(token)}"`);
    }
    if (isPunct(tokens[start + 1], '.')) throw new UnsupportedSqlError(`schema-qualified ${what}`);
    return { name: token.value, next: start + 1 };
}

const CLAUSE_KEYWORDS = new Set(['where', 'order', 'limit', 'offset', 'returning', 'on']);

function isClauseKeyword(token: SqlToken): boolean {
    return token.kind === 'word' && CLAUSE_KEYWORDS.has(token.value);
}

function isWord(token: SqlToken | undefined, value: string): boolean {
    return token?.kind === 'word' && token.value === value;
}

function isPunct(token: SqlToken | undefined, value: string): boolean {
    return token?.kind === 'punct' && token.value === value;
}

function describe(token: SqlToken | undefined): string {
    if (!token) return 'end of statement';
    return token.kind === 'param' ? `$${token.index}` : token.value;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd package && npx vitest run src/db/parse_statement.test.ts --coverage.enabled=false`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add package/src/db/parse_statement.ts package/src/db/parse_statement.test.ts
git commit -m "feat: parse single-table selects for PostgREST translation"
```

---

### Task 5: statement parser — INSERT / UPDATE / DELETE

**Files:**
- Modify: `package/src/db/parse_statement.ts`
- Test: `package/src/db/parse_statement.test.ts` (append a new `describe`)

**Interfaces:**
- Consumes: Task 4's helpers in the same file.
- Produces (added to `parse_statement.ts`):
  ```ts
  export interface ParsedInsert {
      kind: 'insert';
      table: string;
      columns: string[];
      rows: SqlValue[][];
      onConflict?: { columns: string[]; action: 'nothing' } | { columns: string[]; action: 'update'; set: Record<string, SqlValue | { kind: 'excluded'; column: string }> };
      returning?: Projection[] | 'all';
  }
  export interface ParsedUpdate { kind: 'update'; table: string; set: Record<string, SqlValue>; where?: WhereNode; returning?: Projection[] | 'all' }
  export interface ParsedDelete { kind: 'delete'; table: string; where?: WhereNode; returning?: Projection[] | 'all' }
  export type ParsedStatement = ParsedSelect | ParsedInsert | ParsedUpdate | ParsedDelete;
  ```

- [ ] **Step 1: Write the failing test**

```ts
describe('parseStatement — mutations', () => {
    it('parses a multi-row insert with returning', () => {
        expect(
            parseStatement('insert into "users" ("id", "name") values ($1, $2), ($3, \'bob\') returning "users"."id"'),
        ).toEqual({
            kind: 'insert',
            table: 'users',
            columns: ['id', 'name'],
            rows: [
                [{ kind: 'param', index: 1 }, { kind: 'param', index: 2 }],
                [{ kind: 'param', index: 3 }, { kind: 'literal', value: 'bob' }],
            ],
            returning: [{ column: 'id' }],
        });
    });

    it('parses on conflict do nothing', () => {
        expect(parseStatement('insert into "t" ("a") values ($1) on conflict ("a") do nothing').onConflict).toEqual({
            columns: ['a'],
            action: 'nothing',
        });
    });

    it('parses on conflict do update set with excluded and literal values', () => {
        expect(
            parseStatement('insert into "t" ("a", "b") values ($1, $2) on conflict ("a") do update set "b" = excluded."b", "c" = $3')
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
        expect(parseStatement('update "t" set "a" = $1, "b" = null where "id" = $2 returning *')).toEqual({
            kind: 'update',
            table: 't',
            set: { a: { kind: 'param', index: 1 }, b: { kind: 'literal', value: null } },
            where: { kind: 'compare', column: 'id', operator: 'eq', value: { kind: 'param', index: 2 } },
            returning: 'all',
        });
    });

    it('parses a delete with where', () => {
        expect(parseStatement('delete from "t" where "id" = $1')).toEqual({
            kind: 'delete',
            table: 't',
            where: { kind: 'compare', column: 'id', operator: 'eq', value: { kind: 'param', index: 1 } },
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
            'update "t" set "a" = "b" where "id" = $1',
            'update "t" from "u" set "a" = $1',
            'update "t" set "a" = $1 returning "x" as "y", lower("z")',
            'delete from "t" using "u" where "t"."id" = "u"."id"',
            'delete "t" where "id" = $1',
            'truncate "t"',
        ];
        for (const sql of rejected) {
            expect(() => parseStatement(sql), sql).toThrow(UnsupportedSqlError);
        }
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd package && npx vitest run src/db/parse_statement.test.ts --coverage.enabled=false`
Expected: FAIL — every mutation case throws `UnsupportedSqlError: statement type "insert"`.

- [ ] **Step 3: Write the implementation**

Add to `parse_statement.ts` (and extend the `ParsedStatement` union and `parseStatement`'s dispatch with `insert`/`update`/`delete`):

```ts
/** A single-table `insert`, optionally an upsert, optionally `returning`. */
export interface ParsedInsert {
    kind: 'insert';
    table: string;
    columns: string[];
    rows: SqlValue[][];
    onConflict?: OnConflict;
    returning?: Projection[] | 'all';
}

/** The `excluded.<column>` reference an upsert's `do update set` may use. */
export type ExcludedRef = { kind: 'excluded'; column: string };

/** A parsed `on conflict` clause. */
export type OnConflict =
    | { columns: string[]; action: 'nothing' }
    | { columns: string[]; action: 'update'; set: Record<string, SqlValue | ExcludedRef> };

/** A single-table `update`. */
export interface ParsedUpdate {
    kind: 'update';
    table: string;
    set: Record<string, SqlValue>;
    where?: WhereNode;
    returning?: Projection[] | 'all';
}

/** A single-table `delete`. */
export interface ParsedDelete {
    kind: 'delete';
    table: string;
    where?: WhereNode;
    returning?: Projection[] | 'all';
}
```

```ts
function parseInsert(tokens: SqlToken[]): ParsedInsert {
    let index = 1;
    if (!isWord(tokens[index], 'into')) throw new UnsupportedSqlError('`insert` without `into`');
    index++;
    const table = readIdentifier(tokens, index, 'table name');
    index = table.next;

    if (!isPunct(tokens[index], '(')) throw new UnsupportedSqlError('`insert` without an explicit column list');
    const columns = readIdentifierList(tokens, index);
    index = columns.next;

    if (!isWord(tokens[index], 'values')) throw new UnsupportedSqlError('`insert` without a `values` list');
    index++;

    const rows: SqlValue[][] = [];
    for (;;) {
        if (!isPunct(tokens[index], '(')) throw new UnsupportedSqlError('malformed `values` list');
        index++;
        const row: SqlValue[] = [];
        for (;;) {
            const value = readInsertValue(tokens, index);
            row.push(value.value);
            index = value.next;
            if (isPunct(tokens[index], ',')) {
                index++;
                continue;
            }
            break;
        }
        if (!isPunct(tokens[index], ')')) throw new UnsupportedSqlError('unterminated `values` row');
        index++;
        rows.push(row);
        if (isPunct(tokens[index], ',')) {
            index++;
            continue;
        }
        break;
    }

    const insert: ParsedInsert = { kind: 'insert', table: table.name, columns: columns.names, rows };

    if (isWord(tokens[index], 'on')) {
        const parsed = parseOnConflict(tokens, index);
        insert.onConflict = parsed.value;
        index = parsed.next;
    }

    const returning = parseReturning(tokens, index);
    if (returning.value) insert.returning = returning.value;
    requireEnd(tokens, returning.next);
    return insert;
}

function parseOnConflict(tokens: SqlToken[], start: number): { value: OnConflict; next: number } {
    let index = start + 1;
    if (!isWord(tokens[index], 'conflict')) throw new UnsupportedSqlError('`on` without `conflict`');
    index++;
    if (!isPunct(tokens[index], '(')) throw new UnsupportedSqlError('`on conflict` without a column list');
    const columns = readIdentifierList(tokens, index);
    index = columns.next;
    if (!isWord(tokens[index], 'do')) throw new UnsupportedSqlError('`on conflict` without `do`');
    index++;
    if (isWord(tokens[index], 'nothing')) {
        return { value: { columns: columns.names, action: 'nothing' }, next: index + 1 };
    }
    if (!isWord(tokens[index], 'update')) throw new UnsupportedSqlError('`on conflict do` action other than nothing/update');
    index++;
    if (!isWord(tokens[index], 'set')) throw new UnsupportedSqlError('`do update` without `set`');
    const assignments = readAssignments(tokens, index + 1, true);
    return {
        value: { columns: columns.names, action: 'update', set: assignments.value },
        next: assignments.next,
    };
}

function parseUpdate(tokens: SqlToken[]): ParsedUpdate {
    const table = readIdentifier(tokens, 1, 'table name');
    let index = table.next;
    if (!isWord(tokens[index], 'set')) throw new UnsupportedSqlError('`update` without a plain `set`');
    const assignments = readAssignments(tokens, index + 1, false);
    index = assignments.next;

    const update: ParsedUpdate = { kind: 'update', table: table.name, set: assignments.value as Record<string, SqlValue> };

    if (isWord(tokens[index], 'where')) {
        const parsed = parseWhere(tokens, index + 1);
        update.where = parsed.node;
        index = parsed.next;
    }
    const returning = parseReturning(tokens, index);
    if (returning.value) update.returning = returning.value;
    requireEnd(tokens, returning.next);
    return update;
}

function parseDelete(tokens: SqlToken[]): ParsedDelete {
    if (!isWord(tokens[1], 'from')) throw new UnsupportedSqlError('`delete` without `from`');
    const table = readIdentifier(tokens, 2, 'table name');
    let index = table.next;
    const statement: ParsedDelete = { kind: 'delete', table: table.name };
    if (isWord(tokens[index], 'where')) {
        const parsed = parseWhere(tokens, index + 1);
        statement.where = parsed.node;
        index = parsed.next;
    }
    const returning = parseReturning(tokens, index);
    if (returning.value) statement.returning = returning.value;
    requireEnd(tokens, returning.next);
    return statement;
}

function parseReturning(tokens: SqlToken[], start: number): { value: Projection[] | 'all' | undefined; next: number } {
    if (!isWord(tokens[start], 'returning')) return { value: undefined, next: start };
    if (isPunct(tokens[start + 1], '*')) return { value: 'all', next: start + 2 };
    const projection = parseProjection(tokens, start + 1);
    if (projection.value === 'all') throw new UnsupportedSqlError('unsupported `returning` list');
    return { value: projection.value, next: projection.next };
}

function readAssignments(
    tokens: SqlToken[],
    start: number,
    allowExcluded: boolean,
): { value: Record<string, SqlValue | ExcludedRef>; next: number } {
    const set: Record<string, SqlValue | ExcludedRef> = {};
    let index = start;
    for (;;) {
        const column = readColumnName(tokens, index);
        index = column.next;
        if (!isPunct(tokens[index], '=')) throw new UnsupportedSqlError('malformed `set` assignment');
        index++;
        if (allowExcluded && isWord(tokens[index], 'excluded') && isPunct(tokens[index + 1], '.')) {
            const referenced = readColumnName(tokens, index + 2);
            set[column.name] = { kind: 'excluded', column: referenced.name };
            index = referenced.next;
        } else {
            const value = readInsertValue(tokens, index);
            set[column.name] = value.value;
            index = value.next;
        }
        if (isPunct(tokens[index], ',')) {
            index++;
            continue;
        }
        break;
    }
    return { value: set, next: index };
}

function readInsertValue(tokens: SqlToken[], start: number): { value: SqlValue; next: number } {
    const token = tokens[start];
    if (token?.kind === 'param') return { value: { kind: 'param', index: token.index }, next: start + 1 };
    if (token?.kind === 'string') return { value: { kind: 'literal', value: token.value }, next: start + 1 };
    if (token?.kind === 'number') return { value: { kind: 'literal', value: Number(token.value) }, next: start + 1 };
    if (isPunct(token, '-') && tokens[start + 1]?.kind === 'number') {
        return { value: { kind: 'literal', value: -Number((tokens[start + 1] as { value: string }).value) }, next: start + 2 };
    }
    if (token?.kind === 'word' && (token.value === 'true' || token.value === 'false')) {
        return { value: { kind: 'literal', value: token.value === 'true' }, next: start + 1 };
    }
    if (token?.kind === 'word' && token.value === 'null') return { value: { kind: 'literal', value: null }, next: start + 1 };
    throw new UnsupportedSqlError(`unsupported value near "${describe(token)}"`);
}

function readColumnName(tokens: SqlToken[], start: number): { name: string; next: number } {
    const token = tokens[start];
    if (!token || (token.kind !== 'quoted' && token.kind !== 'word')) {
        throw new UnsupportedSqlError(`expected a column near "${describe(token)}"`);
    }
    if (isPunct(tokens[start + 1], '.')) {
        const qualified = tokens[start + 2];
        if (!qualified || (qualified.kind !== 'quoted' && qualified.kind !== 'word')) {
            throw new UnsupportedSqlError('expected a column after a table qualifier');
        }
        return { name: qualified.value, next: start + 3 };
    }
    return { name: token.value, next: start + 1 };
}

function readIdentifierList(tokens: SqlToken[], start: number): { names: string[]; next: number } {
    let index = start + 1;
    const names: string[] = [];
    for (;;) {
        const column = readColumnName(tokens, index);
        names.push(column.name);
        index = column.next;
        if (isPunct(tokens[index], ',')) {
            index++;
            continue;
        }
        break;
    }
    if (!isPunct(tokens[index], ')')) throw new UnsupportedSqlError('unterminated column list');
    return { names, next: index + 1 };
}

function requireEnd(tokens: SqlToken[], index: number): void {
    if (index < tokens.length) throw new UnsupportedSqlError(`trailing clause near "${describe(tokens[index])}"`);
}
```

Also replace the two existing `if (index < tokens.length) throw …` in `parseSelect` with `requireEnd(tokens, index)`, and extend the dispatcher:

```ts
    if (first.value === 'select') return parseSelect(tokens);
    if (first.value === 'insert') return parseInsert(tokens);
    if (first.value === 'update') return parseUpdate(tokens);
    if (first.value === 'delete') return parseDelete(tokens);
    throw new UnsupportedSqlError(`statement type "${first.value}"`);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd package && npx vitest run src/db/parse_statement.test.ts --coverage.enabled=false`
Expected: PASS, 11 tests.

- [ ] **Step 5: Check per-file coverage**

Run: `cd package && npx vitest run src/db/parse_statement.test.ts --coverage.include='src/db/parse_statement.ts'`
Expected: 100%. Add a rejection case per uncovered `throw` and re-run.

- [ ] **Step 6: Commit**

```bash
git add package/src/db/parse_statement.ts package/src/db/parse_statement.test.ts
git commit -m "feat: parse single-table insert/update/delete for PostgREST translation"
```

---

### Task 6: `where` tree → PostgREST filters

**Files:**
- Create: `package/src/db/rest_filters.ts`
- Test: `package/src/db/rest_filters.test.ts`

**Interfaces:**
- Consumes: `WhereNode`, `SqlValue` (Task 3); `UnsupportedSqlError` (Task 2).
- Produces:
  ```ts
  export interface FilterTarget {
      eq(column: string, value: unknown): FilterTarget;
      neq(column: string, value: unknown): FilterTarget;
      gt(column: string, value: unknown): FilterTarget;
      gte(column: string, value: unknown): FilterTarget;
      lt(column: string, value: unknown): FilterTarget;
      lte(column: string, value: unknown): FilterTarget;
      like(column: string, pattern: string): FilterTarget;
      ilike(column: string, pattern: string): FilterTarget;
      is(column: string, value: null): FilterTarget;
      in(column: string, values: readonly unknown[]): FilterTarget;
      not(column: string, operator: string, value: unknown): FilterTarget;
      or(filters: string): FilterTarget;
  }
  export function resolveValue(value: SqlValue, params: unknown[]): unknown;
  export default function applyWhere<T extends FilterTarget>(builder: T, node: WhereNode, params: unknown[]): T;
  ```
  Top-level `and` children are applied as individual builder calls; `or`/`not` subtrees are serialised into one PostgREST filter string and applied via `.or()`.

- [ ] **Step 1: Write the failing test**

```ts
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
                { kind: 'compare', column: 'a', operator: 'eq', value: { kind: 'literal', value: 1 } },
                {
                    kind: 'and',
                    children: [
                        { kind: 'compare', column: 'b', operator: 'lt', value: { kind: 'literal', value: 2 } },
                        { kind: 'not', child: { kind: 'is', column: 'c', negated: false } },
                    ],
                },
                { kind: 'in', column: 'd', values: [{ kind: 'literal', value: 'x,y' }] },
            ],
        };
        applyWhere(builder, node, []);
        expect(calls).toEqual(['or("a.eq.1,and(b.lt.2,not.c.is.null),d.in.(\\"x,y\\")")']);
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
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd package && npx vitest run src/db/rest_filters.test.ts`
Expected: FAIL — cannot resolve `./rest_filters`.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { CompareOperator, SqlValue, WhereNode } from './parse_where';
import UnsupportedSqlError from './unsupported_sql';

/**
 * The subset of `@supabase/postgrest-js`'s filter methods this module calls,
 * declared structurally so nothing here imports `@supabase/supabase-js`.
 */
export interface FilterTarget {
    eq(column: string, value: unknown): FilterTarget;
    neq(column: string, value: unknown): FilterTarget;
    gt(column: string, value: unknown): FilterTarget;
    gte(column: string, value: unknown): FilterTarget;
    lt(column: string, value: unknown): FilterTarget;
    lte(column: string, value: unknown): FilterTarget;
    like(column: string, pattern: string): FilterTarget;
    ilike(column: string, pattern: string): FilterTarget;
    is(column: string, value: null): FilterTarget;
    in(column: string, values: readonly unknown[]): FilterTarget;
    not(column: string, operator: string, value: unknown): FilterTarget;
    or(filters: string): FilterTarget;
}

/**
 * Reads a parsed value against the statement's positional parameters.
 *
 * @param value A placeholder reference or an inline literal.
 * @param params The statement's positional parameters, 1-indexed by `$n`.
 * @returns The JavaScript value to send to PostgREST.
 * @throws {UnsupportedSqlError} If a placeholder has no matching parameter.
 */
export function resolveValue(value: SqlValue, params: unknown[]): unknown {
    if (value.kind === 'literal') return value.value;
    if (value.index < 1 || value.index > params.length) {
        throw new UnsupportedSqlError(`placeholder $${value.index} with only ${params.length} param(s)`);
    }
    return params[value.index - 1];
}

/**
 * Applies a parsed `where` tree to a PostgREST query builder.
 *
 * A top-level `and` becomes one builder call per child, which is what
 * PostgREST already means by stacked filters. Anything with an `or` or `not`
 * in it has to travel as a single serialised filter string instead, because
 * that is the only way PostgREST expresses boolean structure.
 *
 * @param builder The query builder to apply filters to.
 * @param node The parsed `where` tree.
 * @param params The statement's positional parameters.
 * @returns The builder, for chaining.
 * @throws {UnsupportedSqlError} If a value cannot be carried by the filter
 * syntax the node requires.
 */
export default function applyWhere<T extends FilterTarget>(builder: T, node: WhereNode, params: unknown[]): T {
    if (node.kind === 'and') {
        for (const child of node.children) applyWhere(builder, child, params);
        return builder;
    }
    if (node.kind === 'or' || node.kind === 'not') {
        builder.or(serialize(node, params));
        return builder;
    }
    if (node.kind === 'is') {
        if (node.negated) builder.not(node.column, 'is', null);
        else builder.is(node.column, null);
        return builder;
    }
    if (node.kind === 'in') {
        builder.in(node.column, node.values.map((value) => resolveValue(value, params)));
        return builder;
    }
    builder[node.operator](node.column, resolveValue(node.value, params) as never);
    return builder;
}

const NEGATABLE: Record<CompareOperator, string> = {
    eq: 'eq',
    neq: 'neq',
    gt: 'gt',
    gte: 'gte',
    lt: 'lt',
    lte: 'lte',
    like: 'like',
    ilike: 'ilike',
};

function serialize(node: WhereNode, params: unknown[]): string {
    if (node.kind === 'and' || node.kind === 'or') {
        const children = node.children.map((child) => serialize(child, params)).join(',');
        return node.kind === 'and' ? `and(${children})` : children;
    }
    if (node.kind === 'not') return `not.${serialize(node.child, params)}`;
    if (node.kind === 'is') return node.negated ? `not.${node.column}.is.null` : `${node.column}.is.null`;
    if (node.kind === 'in') {
        const values = node.values.map((value) => encodeFilterValue(resolveValue(value, params))).join(',');
        return `${node.column}.in.(${values})`;
    }
    return `${node.column}.${NEGATABLE[node.operator]}.${encodeFilterValue(resolveValue(node.value, params))}`;
}

function encodeFilterValue(value: unknown): string {
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (typeof value !== 'string') {
        throw new UnsupportedSqlError(`value of type ${value === null ? 'null' : typeof value} inside an or()/not() filter`);
    }
    return /[,.():"\s]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}
```

Note on the serialised `or` shape: a nested `or` inside an `or` flattens to a
comma list, which is exactly PostgREST's own semantics for the top level of
`or(...)`; a nested `and` is wrapped in `and(...)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd package && npx vitest run src/db/rest_filters.test.ts --coverage.enabled=false`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add package/src/db/rest_filters.ts package/src/db/rest_filters.test.ts
git commit -m "feat: map parsed where trees onto PostgREST filters"
```

---

### Task 7: extract the Supabase REST client factory

**Files:**
- Create: `package/src/db/rest_client.ts`
- Test: `package/src/db/rest_client.test.ts`

**Interfaces:**
- Consumes: `resolveSupabaseEndpoint` (existing `supabase_config.ts`), `SupabaseDbConfig` (existing types).
- Produces:
  ```ts
  export interface RestQueryResult<T> { data: T | null; error: { message: string; code?: string } | null; count: number | null }
  export interface RestQueryBuilder extends FilterTarget {
      select(columns?: string, opts?: { count?: 'exact'; head?: boolean }): RestQueryBuilder;
      insert(values: Record<string, unknown>[]): RestQueryBuilder;
      upsert(values: Record<string, unknown>[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }): RestQueryBuilder;
      update(values: Record<string, unknown>): RestQueryBuilder;
      delete(): RestQueryBuilder;
      order(column: string, opts?: { ascending?: boolean; nullsFirst?: boolean }): RestQueryBuilder;
      limit(count: number): RestQueryBuilder;
      range(from: number, to: number): RestQueryBuilder;
      then<T>(onfulfilled?: (value: RestQueryResult<T>) => unknown): Promise<unknown>;
  }
  export interface RestClient {
      from(table: string): RestQueryBuilder;
      rpc(fn: string, args?: Record<string, unknown>): Promise<RestQueryResult<unknown>>;
  }
  export default function createRestClient(supabase: SupabaseDbConfig, bearerToken: string): () => Promise<RestClient>;
  ```
  The returned thunk memoizes one client per call to `createRestClient`.

- [ ] **Step 1: Write the failing test**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import createRestClient from './rest_client';

const createClient = vi.fn();
vi.mock('@supabase/supabase-js', () => ({ createClient: (...args: unknown[]) => createClient(...args) }));

describe('createRestClient', () => {
    beforeEach(() => {
        createClient.mockReset().mockReturnValue({ from: vi.fn(), rpc: vi.fn() });
    });

    it('creates one client from the resolved endpoint and reuses it', async () => {
        const getClient = createRestClient({ url: 'https://p.supabase.co/', anonKey: 'anon' }, 'bearer');
        const first = await getClient();
        const second = await getClient();
        expect(first).toBe(second);
        expect(createClient).toHaveBeenCalledTimes(1);
        expect(createClient.mock.calls[0]![0]).toBe('https://p.supabase.co');
        expect(createClient.mock.calls[0]![1]).toBe('anon');
        await expect((createClient.mock.calls[0]![2] as { accessToken: () => Promise<string> }).accessToken()).resolves.toBe('bearer');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd package && npx vitest run src/db/rest_client.test.ts`
Expected: FAIL — cannot resolve `./rest_client`.

- [ ] **Step 3: Write minimal implementation**

Move the client-creation logic out of `supabase_transport.ts`/`supabase_rest.ts` into `rest_client.ts`, and move the builder typings there too (copy the structural interfaces from `supabase_rest.ts`, trimmed to the methods listed in **Interfaces** above; extend `FilterTarget` from `./rest_filters` so the two stay in sync).

```ts
import type { SupabaseDbConfig } from '../types/types';
import type { FilterTarget } from './rest_filters';
import resolveSupabaseEndpoint from './supabase_config';

// … interfaces exactly as listed in this task's Interfaces block …

/**
 * Builds a memoized accessor for the `@supabase/supabase-js` client used by
 * both the REST translator and the `cfni_exec` fallback.
 *
 * `bearerToken` is delivered through the client's `accessToken` option — the
 * same mechanism a signed-in Supabase session uses — so identity and RLS are
 * decided by Postgres, not by this package. The client is created lazily on
 * first use so importing the db module never pulls `@supabase/supabase-js`
 * into a bundle that does not query.
 *
 * @param supabase The `db.supabase` config block.
 * @param bearerToken The anon key, or a per-request user JWT.
 * @returns A thunk resolving to the shared client.
 */
export default function createRestClient(supabase: SupabaseDbConfig, bearerToken: string): () => Promise<RestClient> {
    let clientPromise: Promise<RestClient> | null = null;
    return () => {
        clientPromise ??= (async () => {
            const { url, anonKey } = await resolveSupabaseEndpoint(supabase);
            const { createClient } = await import('@supabase/supabase-js');
            return createClient(url, anonKey, { accessToken: async () => bearerToken }) as unknown as RestClient;
        })();
        return clientPromise;
    };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd package && npx vitest run src/db/rest_client.test.ts --coverage.enabled=false`
Expected: PASS, 1 test.

- [ ] **Step 5: Commit**

```bash
git add package/src/db/rest_client.ts package/src/db/rest_client.test.ts
git commit -m "refactor: extract the shared Supabase REST client factory"
```

---

### Task 8: execute a parsed statement over PostgREST

**Files:**
- Create: `package/src/db/rest_execute.ts`
- Test: `package/src/db/rest_execute.test.ts`

**Interfaces:**
- Consumes: Tasks 2–7.
- Produces: `export default async function executeRest(client: RestClient, statement: ParsedStatement, params: unknown[]): Promise<{ rows: unknown[][]; rowCount: number | null }>`.
  - Rows are positional arrays ordered by the statement's projection (`returning` for mutations). `projection === 'all'` is an `UnsupportedSqlError` (`pg-proxy` maps result columns by index, and PostgREST's `*` gives no stable order).
  - A mutation with no `returning` resolves `{ rows: [], rowCount }` using PostgREST's `count: 'exact'`.
  - A PostgREST `error` becomes a plain `Error` with `db: Supabase rejected the query — ${message}.`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest';
import executeRest from './rest_execute';
import type { RestClient } from './rest_client';
import UnsupportedSqlError from './unsupported_sql';

function stubClient(result: { data: unknown; error?: { message: string; code?: string } | null; count?: number | null }) {
    const calls: { method: string; args: unknown[] }[] = [];
    const builder: Record<string, unknown> = {};
    const proxy = new Proxy(builder, {
        get(_target, method: string) {
            if (method === 'then') {
                return (onfulfilled: (value: unknown) => unknown) =>
                    Promise.resolve(onfulfilled({ data: result.data, error: result.error ?? null, count: result.count ?? null }));
            }
            return (...args: unknown[]) => {
                calls.push({ method, args });
                return proxy;
            };
        },
    });
    const from = vi.fn(() => proxy);
    return { calls, from, client: { from, rpc: vi.fn() } as unknown as RestClient };
}

describe('executeRest', () => {
    it('runs a select and returns positional rows in projection order', async () => {
        const { client, calls, from } = stubClient({ data: [{ id: 1, name: 'a' }, { id: 2, name: 'b' }] });
        const result = await executeRest(
            client,
            {
                kind: 'select',
                table: 'users',
                projection: [{ column: 'id' }, { column: 'name', alias: 'userName' }],
                where: { kind: 'compare', column: 'id', operator: 'gt', value: { kind: 'param', index: 1 } },
                orderBy: [{ column: 'name', ascending: false, nullsFirst: true }],
                limit: { kind: 'literal', value: 10 },
                offset: { kind: 'literal', value: 5 },
            },
            [0],
        );
        expect(from).toHaveBeenCalledWith('users');
        expect(calls.map((call) => call.method)).toEqual(['select', 'gt', 'order', 'range']);
        expect(calls[0]!.args[0]).toBe('id,userName:name');
        expect(calls[2]!.args).toEqual(['name', { ascending: false, nullsFirst: true }]);
        expect(calls[3]!.args).toEqual([5, 14]);
        expect(result).toEqual({ rows: [[1, 'a'], [2, 'b']], rowCount: 2 });
    });

    it('uses limit() when there is no offset', async () => {
        const { client, calls } = stubClient({ data: [] });
        await executeRest(
            client,
            { kind: 'select', table: 't', projection: [{ column: 'id' }], orderBy: [], limit: { kind: 'literal', value: 3 } },
            [],
        );
        expect(calls.map((call) => call.method)).toEqual(['select', 'limit']);
        expect(calls[1]!.args).toEqual([3]);
    });

    it('inserts rows and returns the returning projection', async () => {
        const { client, calls } = stubClient({ data: [{ id: 7 }] });
        const result = await executeRest(
            client,
            {
                kind: 'insert',
                table: 't',
                columns: ['id', 'name'],
                rows: [[{ kind: 'param', index: 1 }, { kind: 'literal', value: 'x' }]],
                returning: [{ column: 'id' }],
            },
            [7],
        );
        expect(calls[0]!.method).toBe('insert');
        expect(calls[0]!.args[0]).toEqual([{ id: 7, name: 'x' }]);
        expect(calls[1]!.method).toBe('select');
        expect(result).toEqual({ rows: [[7]], rowCount: 1 });
    });

    it('maps on conflict do nothing and do update onto upsert', async () => {
        const nothing = stubClient({ data: null, count: 1 });
        await executeRest(
            nothing.client,
            { kind: 'insert', table: 't', columns: ['a'], rows: [[{ kind: 'literal', value: 1 }]], onConflict: { columns: ['a'], action: 'nothing' } },
            [],
        );
        expect(nothing.calls[0]!.method).toBe('upsert');
        expect(nothing.calls[0]!.args[1]).toEqual({ onConflict: 'a', ignoreDuplicates: true });

        const update = stubClient({ data: null, count: 1 });
        await executeRest(
            update.client,
            {
                kind: 'insert',
                table: 't',
                columns: ['a', 'b'],
                rows: [[{ kind: 'literal', value: 1 }, { kind: 'literal', value: 2 }]],
                onConflict: { columns: ['a'], action: 'update', set: { b: { kind: 'excluded', column: 'b' } } },
            },
            [],
        );
        expect(update.calls[0]!.args[1]).toEqual({ onConflict: 'a', ignoreDuplicates: false });
    });

    it('rejects an upsert whose do-update set is not exactly the inserted values', async () => {
        const { client } = stubClient({ data: null });
        await expect(
            executeRest(
                client,
                {
                    kind: 'insert',
                    table: 't',
                    columns: ['a'],
                    rows: [[{ kind: 'literal', value: 1 }]],
                    onConflict: { columns: ['a'], action: 'update', set: { b: { kind: 'literal', value: 9 } } },
                },
                [],
            ),
        ).rejects.toThrow(UnsupportedSqlError);
    });

    it('updates and deletes, reporting the affected count when there is no returning', async () => {
        const update = stubClient({ data: null, count: 3 });
        expect(
            await executeRest(
                update.client,
                { kind: 'update', table: 't', set: { a: { kind: 'param', index: 1 } }, where: { kind: 'is', column: 'b', negated: false } },
                ['v'],
            ),
        ).toEqual({ rows: [], rowCount: 3 });
        expect(update.calls[0]!.method).toBe('update');
        expect(update.calls[0]!.args[0]).toEqual({ a: 'v' });
        expect(update.calls[1]!.method).toBe('select');
        expect(update.calls[1]!.args).toEqual(['', { count: 'exact', head: true }]);

        const remove = stubClient({ data: null, count: 1 });
        expect(await executeRest(remove.client, { kind: 'delete', table: 't' }, [])).toEqual({ rows: [], rowCount: 1 });
        expect(remove.calls[0]!.method).toBe('delete');
    });

    it('rejects a projection of *', async () => {
        const { client } = stubClient({ data: [] });
        await expect(
            executeRest(client, { kind: 'select', table: 't', projection: 'all', orderBy: [] }, []),
        ).rejects.toThrow(UnsupportedSqlError);
    });

    it('surfaces a PostgREST error', async () => {
        const { client } = stubClient({ data: null, error: { message: 'permission denied' } });
        await expect(
            executeRest(client, { kind: 'select', table: 't', projection: [{ column: 'id' }], orderBy: [] }, []),
        ).rejects.toThrow('db: Supabase rejected the query — permission denied.');
    });

    it('treats a missing column in a returned row as null', async () => {
        const { client } = stubClient({ data: [{}] });
        expect(
            await executeRest(client, { kind: 'select', table: 't', projection: [{ column: 'id' }], orderBy: [] }, []),
        ).toEqual({ rows: [[null]], rowCount: 1 });
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd package && npx vitest run src/db/rest_execute.test.ts`
Expected: FAIL — cannot resolve `./rest_execute`.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { ParsedStatement, Projection } from './parse_statement';
import type { RestClient, RestQueryBuilder, RestQueryResult } from './rest_client';
import applyWhere, { resolveValue } from './rest_filters';
import UnsupportedSqlError from './unsupported_sql';

/**
 * Runs a parsed statement through PostgREST and reshapes the response into the
 * `{ rows, rowCount }` contract `drizzle-orm/pg-proxy` expects.
 *
 * Rows come back as positional arrays because `pg-proxy` maps result columns
 * by index, which is also why a `select *`/`returning *` cannot be served
 * here: PostgREST gives no column order to map against. Statements without a
 * projection ask PostgREST for an exact count instead of rows, so Drizzle's
 * `rowCount` keeps meaning what it means on a real connection.
 *
 * @param client The Supabase REST client.
 * @param statement The parsed statement.
 * @param params The statement's positional parameters.
 * @returns Rows in projection order and the affected/returned row count.
 * @throws {UnsupportedSqlError} If the statement needs something PostgREST
 * cannot express (`*` projection, an upsert whose `do update set` diverges
 * from the inserted values).
 * @throws If PostgREST rejects the request.
 */
export default async function executeRest(
    client: RestClient,
    statement: ParsedStatement,
    params: unknown[],
): Promise<{ rows: unknown[][]; rowCount: number | null }> {
    const projection = statement.kind === 'select' ? statement.projection : statement.returning;
    const table = client.from(statement.table);
    let builder: RestQueryBuilder;

    if (statement.kind === 'select') {
        builder = table.select(columnList(projection));
        if (statement.where) applyWhere(builder, statement.where, params);
        for (const term of statement.orderBy) {
            builder = builder.order(term.column, { ascending: term.ascending, nullsFirst: term.nullsFirst });
        }
        applyRange(builder, statement, params);
    } else if (statement.kind === 'insert') {
        const values = statement.rows.map((row) =>
            Object.fromEntries(statement.columns.map((column, index) => [column, resolveValue(row[index]!, params)])),
        );
        builder = statement.onConflict
            ? table.upsert(values, {
                onConflict: statement.onConflict.columns.join(','),
                ignoreDuplicates: statement.onConflict.action === 'nothing',
            })
            : table.insert(values);
        if (statement.onConflict?.action === 'update') requirePlainUpsert(statement.onConflict.set);
        builder = withProjection(builder, projection);
    } else if (statement.kind === 'update') {
        const values = Object.fromEntries(
            Object.entries(statement.set).map(([column, value]) => [column, resolveValue(value, params)]),
        );
        builder = table.update(values);
        if (statement.where) applyWhere(builder, statement.where, params);
        builder = withProjection(builder, projection);
    } else {
        builder = table.delete();
        if (statement.where) applyWhere(builder, statement.where, params);
        builder = withProjection(builder, projection);
    }

    const { data, error, count } = await (builder as unknown as Promise<RestQueryResult<Record<string, unknown>[]>>);
    if (error) throw new Error(`db: Supabase rejected the query — ${error.message}.`);
    if (!projection) return { rows: [], rowCount: count };
    const rows = (data ?? []).map((row) => projectionOf(projection).map(({ column, alias }) => row[alias ?? column] ?? null));
    return { rows, rowCount: rows.length };
}

function withProjection(builder: RestQueryBuilder, projection: Projection[] | 'all' | undefined): RestQueryBuilder {
    if (!projection) return builder.select('', { count: 'exact', head: true });
    return builder.select(columnList(projection));
}

function applyRange(builder: RestQueryBuilder, statement: Extract<ParsedStatement, { kind: 'select' }>, params: unknown[]): void {
    const limit = statement.limit === undefined ? undefined : Number(resolveValue(statement.limit, params));
    const offset = statement.offset === undefined ? undefined : Number(resolveValue(statement.offset, params));
    if (offset !== undefined && limit !== undefined) builder.range(offset, offset + limit - 1);
    else if (limit !== undefined) builder.limit(limit);
    else if (offset !== undefined) builder.range(offset, Number.MAX_SAFE_INTEGER);
}

function requirePlainUpsert(set: Record<string, unknown>): void {
    for (const value of Object.values(set)) {
        if (!value || typeof value !== 'object' || (value as { kind?: string }).kind !== 'excluded') {
            throw new UnsupportedSqlError('`on conflict do update set` with a value other than `excluded.<column>`');
        }
    }
}

function projectionOf(projection: Projection[] | 'all'): Projection[] {
    if (projection === 'all') throw new UnsupportedSqlError('`*` projection over the REST API');
    return projection;
}

function columnList(projection: Projection[] | 'all'): string {
    return projectionOf(projection)
        .map(({ column, alias }) => (alias ? `${alias}:${column}` : column))
        .join(',');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd package && npx vitest run src/db/rest_execute.test.ts --coverage.enabled=false`
Expected: PASS, 9 tests.

- [ ] **Step 5: Check per-file coverage**

Run: `cd package && npx vitest run src/db/rest_execute.test.ts --coverage.include='src/db/rest_execute.ts'`
Expected: 100%. Missing branches to cover if reported: offset-without-limit (`range(offset, MAX_SAFE_INTEGER)`), `returning: 'all'` on a mutation, an `insert` without `onConflict`.

- [ ] **Step 6: Commit**

```bash
git add package/src/db/rest_execute.ts package/src/db/rest_execute.test.ts
git commit -m "feat: execute parsed statements through the Supabase REST API"
```

---

### Task 9: transport routes translation → `cfni_exec` → error

**Files:**
- Modify: `package/src/db/supabase_transport.ts`
- Modify: `package/src/db/supabase_transport.test.ts`
- Modify: `package/src/db/context.ts:41-48` (delete `requireRawSql` and its call in `supabaseDb`)
- Modify: `package/src/db/context.test.ts` (drop the `rawSql: false` throw expectation)

**Interfaces:**
- Consumes: `parseStatement` (Tasks 4–5), `executeRest` (Task 8), `createRestClient` (Task 7), `UnsupportedSqlError` (Task 2).
- Produces: unchanged public shape — `createSupabaseTransport(supabase, bearerToken): SupabaseRemoteCallback`.
- Behaviour: per statement — parse+execute over REST; on `UnsupportedSqlError`, if `supabase.rawSql === false` rethrow a message that adds the two ways forward, otherwise run the existing `cfni_exec` path.

- [ ] **Step 1: Write the failing tests**

Append to `package/src/db/supabase_transport.test.ts`:

```ts
describe('createSupabaseTransport — REST translation', () => {
    it('translates a supported statement instead of calling cfni_exec', async () => {
        const rpc = vi.fn();
        const select = vi.fn(() => ({ then: (fn: (value: unknown) => unknown) => Promise.resolve(fn({ data: [{ id: 1 }], error: null, count: null })) }));
        const from = vi.fn(() => ({ select }));
        createClient.mockReturnValue({ from, rpc });

        const run = createSupabaseTransport({ url: 'https://p.supabase.co', anonKey: 'anon' }, 'anon');
        await expect(run('select "t"."id" from "t"', [], 'all')).resolves.toEqual({ rows: [[1]], rowCount: 1 });
        expect(rpc).not.toHaveBeenCalled();
    });

    it('falls back to cfni_exec for an untranslatable statement', async () => {
        const rpc = vi.fn(async () => ({ data: { rows: [], rowCount: 0 }, error: null }));
        createClient.mockReturnValue({ from: vi.fn(), rpc });

        const run = createSupabaseTransport({ url: 'https://p.supabase.co', anonKey: 'anon' }, 'anon');
        await run('select count(*) from "t"', [], 'all');
        expect(rpc).toHaveBeenCalledWith('cfni_exec', { statement: 'select count(*) from "t"' });
    });

    it('explains the limitation instead of falling back when rawSql is false', async () => {
        const rpc = vi.fn();
        createClient.mockReturnValue({ from: vi.fn(), rpc });

        const run = createSupabaseTransport({ url: 'https://p.supabase.co', anonKey: 'anon', rawSql: false }, 'anon');
        await expect(run('select count(*) from "t"', [], 'all')).rejects.toThrow(
            /cannot be expressed through the Supabase REST API[\s\S]*db\.supabase\.rawSql[\s\S]*db\.connectionString/,
        );
        expect(rpc).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd package && npx vitest run src/db/supabase_transport.test.ts --coverage.enabled=false`
Expected: FAIL — the first case calls `cfni_exec`, the third throws the old `rawSql` message.

- [ ] **Step 3: Write the implementation**

In `supabase_transport.ts`: replace the inline client creation with `createRestClient(supabase, bearerToken)` (Task 7) and wrap the returned callback:

```ts
    return async (sql, params) => {
        const client = await getClient();
        try {
            return await executeRest(client, parseStatement(sql), params);
        } catch (error) {
            if (!(error instanceof UnsupportedSqlError)) throw error;
            if (supabase.rawSql === false) throw new Error(unsupportedMessage(error, execFunction));
            return runExec(client, sql, params, execFunction);
        }
    };
```

```ts
function unsupportedMessage(error: UnsupportedSqlError, execFunction: string): string {
    return (
        `${error.message} \`db.supabase.rawSql\` is \`false\`, so it cannot fall back to raw SQL either. ` +
        `Install the ${execFunction} function from supabase/cfni_exec.sql and drop \`rawSql: false\`, ` +
        'or use `db.connectionString` for a direct Postgres connection.'
    );
}
```

`runExec` is today's body — `inlineParams` + `client.rpc(execFunction, { statement })` + `parseExecResult` + `describeFailure` — moved into a named function taking the client.

In `context.ts`: delete `requireRawSql` and its call inside `supabaseDb`, and delete the now-unused `SupabaseDbConfig`-only import if TypeScript reports it unused. `.transaction()`'s throw stays.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd package && npx vitest run src/db/supabase_transport.test.ts src/db/context.test.ts --coverage.enabled=false`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package/src/db/supabase_transport.ts package/src/db/supabase_transport.test.ts package/src/db/context.ts package/src/db/context.test.ts
git commit -m "feat: auto-translate statements to PostgREST before cfni_exec"
```

---

### Task 10: remove the `supabase*` exports

**Files:**
- Modify: `package/src/db/index.ts`
- Delete: `package/src/db/supabase_rest.ts`, `package/src/db/supabase_rest.test.ts`
- Modify: `package/src/types/types.ts:870-882` (the `rawSql` JSDoc)

**Interfaces:**
- Produces: `cloudflare-next-intl/db` exports exactly `withPublicDb`, `withUserDb`, `connectToPostgres`, `disconnectPostgres`, `resetConnectionState`, and the types `DrizzleDb`, `DbRoutingConfig`.

- [ ] **Step 1: Write the failing test**

Create `package/src/db/index.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import * as db from './index';

describe('db entry point', () => {
    it('exposes only the wrapper API', () => {
        expect(Object.keys(db).sort()).toEqual([
            'connectToPostgres',
            'disconnectPostgres',
            'resetConnectionState',
            'withPublicDb',
            'withUserDb',
        ]);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd package && npx vitest run src/db/index.test.ts --coverage.enabled=false`
Expected: FAIL — the received array also lists `supabaseSelect`, `supabaseInsert`, `supabaseUpsert`, `supabaseUpdate`, `supabaseDelete`, `supabaseRpc` and their `*AsUser` twins.

- [ ] **Step 3: Delete the module and its exports**

```bash
git rm package/src/db/supabase_rest.ts package/src/db/supabase_rest.test.ts
```

In `package/src/db/index.ts`: delete both `export { supabase… }` and `export type { Supabase… }` blocks, and rewrite the file's leading JSDoc so it describes one API and automatic transport selection — replace the two paragraphs starting "When `db.supabase.rawSql` is `false`" with:

```
 * You write the same Drizzle code either way. In Supabase mode each generated
 * statement is first translated into `@supabase/supabase-js` `.from()` calls;
 * anything PostgREST cannot express falls back to `cfni_exec`, and if
 * `db.supabase.rawSql` is `false` the call throws naming the construct that
 * needs raw SQL. `.transaction()` is never available in Supabase mode.
```

In `package/src/types/types.ts`, rewrite the `rawSql` doc comment to:

```ts
    /**
     * Set to `false` when `cfni_exec` is not installed and cannot be. The
     * `db` wrappers then serve only the statements they can translate into
     * PostgREST calls (single-table select/insert/update/delete, `on
     * conflict`, `returning`) and throw for anything else — joins,
     * aggregates, CTEs, transactions — naming the construct that needs raw
     * SQL. Defaults to `true`.
     */
```

- [ ] **Step 4: Run the full suite**

Run: `cd package && npm test`
Expected: PASS, coverage thresholds met. Any test still importing `supabase_rest` is a leftover — delete it.

- [ ] **Step 5: Commit**

```bash
git add -A package/src/db package/src/types/types.ts
git commit -m "feat!: remove supabaseSelect/Insert/Update/Delete/Rpc in favour of withPublicDb/withUserDb"
```

---

### Task 11: shipped ESLint config fragment

**Files:**
- Create: `package/src/db/eslint_config.ts`
- Test: `package/src/db/eslint_config.test.ts`
- Modify: `package/package.json` (add the `./dbEslint` export)

**Interfaces:**
- Produces: `export default dbEslintConfig` — an array with one flat-config object whose `rules['no-restricted-imports']` errors on `@supabase/supabase-js`, `pg`, `postgres`, and any `cloudflare-next-intl/dist/*` deep import, each with a message pointing at `withPublicDb`/`withUserDb`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { RuleTester } from 'eslint';
import dbEslintConfig from './eslint_config';

const [flatConfig] = dbEslintConfig;

describe('dbEslintConfig', () => {
    it('restricts the drivers consumers must not reach for', () => {
        const [, options] = flatConfig!.rules!['no-restricted-imports'] as [string, { paths: { name: string; message: string }[] }];
        expect(options.paths.map((path) => path.name)).toEqual(['@supabase/supabase-js', 'pg', 'postgres']);
        for (const path of options.paths) expect(path.message).toContain('withPublicDb');
        expect((options as unknown as { patterns: string[] }).patterns).toEqual(['cloudflare-next-intl/dist/*']);
    });

    it('reports a direct supabase-js import and allows the wrapper import', () => {
        const tester = new RuleTester();
        tester.run('no-restricted-imports', (await import('eslint')).builtinRules?.get('no-restricted-imports')!, {
            valid: [{ code: "import { withPublicDb } from 'cloudflare-next-intl/db';", options: (flatConfig!.rules!['no-restricted-imports'] as unknown[]).slice(1) as never }],
            invalid: [
                {
                    code: "import { createClient } from '@supabase/supabase-js';",
                    options: (flatConfig!.rules!['no-restricted-imports'] as unknown[]).slice(1) as never,
                    errors: 1,
                },
            ],
        });
    });
});
```

If wiring ESLint's `RuleTester` against the built-in rule proves awkward in this vitest setup, keep only the first test (it asserts the shipped configuration itself, which is the contract) and delete the second — do not leave a skipped test behind.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd package && npx vitest run src/db/eslint_config.test.ts`
Expected: FAIL — cannot resolve `./eslint_config`.

- [ ] **Step 3: Write minimal implementation**

```ts
const MESSAGE =
    'Query the database through `withPublicDb`/`withUserDb` from cloudflare-next-intl/db. ' +
    'The package picks the transport (direct Postgres, cfni_exec, or PostgREST) for you.';

/**
 * A flat-config fragment consumers can spread into their `eslint.config.*` to
 * keep application code on the single `db` API.
 *
 * The runtime already refuses to give out a raw client, but an import of
 * `@supabase/supabase-js` or a deep `dist/` path is how that guarantee gets
 * bypassed in practice, so it is worth failing at lint time where the fix is
 * cheap.
 */
const dbEslintConfig = [
    {
        rules: {
            'no-restricted-imports': [
                'error',
                {
                    paths: [
                        { name: '@supabase/supabase-js', message: MESSAGE },
                        { name: 'pg', message: MESSAGE },
                        { name: 'postgres', message: MESSAGE },
                    ],
                    patterns: ['cloudflare-next-intl/dist/*'],
                },
            ],
        },
    },
];

export default dbEslintConfig;
```

- [ ] **Step 4: Add the package export**

In `package/package.json`'s `exports`, after `"./db"`:

```json
		"./dbEslint": {
			"types": "./dist/src/db/eslint_config.d.ts",
			"import": "./dist/src/db/eslint_config.js"
		},
```

- [ ] **Step 5: Run test and build to verify**

Run: `cd package && npx vitest run src/db/eslint_config.test.ts --coverage.enabled=false && npm run build`
Expected: PASS, then a clean `tsc`.

- [ ] **Step 6: Commit**

```bash
git add package/src/db/eslint_config.ts package/src/db/eslint_config.test.ts package/package.json
git commit -m "feat: ship an eslint fragment banning direct db driver imports"
```

---

### Task 12: docs, changelog, and agent notes

**Files:**
- Modify: `package/README.md` (the `db` section), `package/llms.txt`, `package/CHANGELOG.md`
- Create: `.agent/.sub-rules/packages/db.md`
- Modify: `example/` — only if it calls a removed export

**Interfaces:**
- Consumes: the finished API from Tasks 9–11.

- [ ] **Step 1: Find every stale mention**

Run: `cd /Volumes/External/own_projects/cloudflare-next-intl && grep -rn "supabaseSelect\|supabaseInsert\|supabaseUpsert\|supabaseUpdate\|supabaseDelete\|supabaseRpc" package/README.md package/llms.txt example .agent docs`
Expected: a list of lines to rewrite. There must be none left after this task (except in `CHANGELOG.md`, where the removal entry names them).

- [ ] **Step 2: Rewrite the README/llms.txt `db` section**

Replace every `supabase*` example with the equivalent `withPublicDb`/`withUserDb` Drizzle call, and state the three-step routing (translate → `cfni_exec` → error) plus the subset table from the Spec. Document the `./dbEslint` export with a two-line usage snippet:

```ts
import dbEslint from 'cloudflare-next-intl/dbEslint';
export default [...dbEslint];
```

- [ ] **Step 3: Add the CHANGELOG entry**

Under a new `## Unreleased` heading (or the next version heading, matching the file's existing style):

```markdown
### Breaking

- Removed `supabaseSelect`, `supabaseInsert`, `supabaseUpsert`, `supabaseUpdate`, `supabaseDelete`, `supabaseRpc` and their `*AsUser` counterparts. Use `withPublicDb`/`withUserDb`; in Supabase mode statements are now translated to PostgREST calls automatically and only fall back to `cfni_exec` when they cannot be.

### Added

- `cloudflare-next-intl/dbEslint`: a flat-config fragment that blocks direct `@supabase/supabase-js`/`pg` imports in application code.
```

- [ ] **Step 4: Write `.agent/.sub-rules/packages/db.md`**

Cover, in the terse style of the sibling files: the two wrappers and nothing else public; `resolveDbMode`'s precedence; the Supabase pipeline (`supabase_transport` → `parse_statement` → `rest_execute` → `cfni_exec` fallback); the supported SQL subset; why rows are positional arrays; the `UnsupportedSqlError` contract; and that `.transaction()` is Postgres-mode only. Link it from `.agent/.sub-rules/packages/structure.md`'s file list.

- [ ] **Step 5: Verify the whole repo is consistent**

Run: `cd package && npm test && npm run build`
Run: `cd /Volumes/External/own_projects/cloudflare-next-intl && npx eslint .`
Expected: tests pass with coverage thresholds met, `tsc` clean, lint clean.

- [ ] **Step 6: Commit**

```bash
git add -A package/README.md package/llms.txt package/CHANGELOG.md .agent example
git commit -m "docs: document the single db API and PostgREST translation"
```

---

---

### Task 13: extended operator coverage — everything postgrest-js can express

**Files:**
- Modify: `package/src/db/parse_where.ts`, `package/src/db/parse_where.test.ts`
- Modify: `package/src/db/rest_filters.ts`, `package/src/db/rest_filters.test.ts`
- Modify: `package/src/db/parse_statement.ts`, `package/src/db/parse_statement.test.ts`
- Modify: `package/src/db/rest_execute.ts`, `package/src/db/rest_execute.test.ts`

**Interfaces:**
- Consumes: Tasks 3, 4, 6, 8.
- Produces (widened types):
  ```ts
  export type CompareOperator =
      | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike'
      | 'regexMatch' | 'regexIMatch'
      | 'contains' | 'containedBy' | 'overlaps'
      | 'rangeGt' | 'rangeGte' | 'rangeLt' | 'rangeLte' | 'rangeAdjacent'
      | 'isDistinct';
  export type WhereNode =
      | { kind: 'and' | 'or'; children: WhereNode[] }
      | { kind: 'not'; child: WhereNode }
      | { kind: 'compare'; column: string; operator: CompareOperator; value: SqlValue }
      | { kind: 'is'; column: string; negated: boolean }
      | { kind: 'in'; column: string; values: SqlValue[]; negated: boolean }
      | { kind: 'textSearch'; column: string; value: SqlValue; type?: 'plain' | 'phrase' | 'websearch'; config?: string };
  ```
  `FilterTarget` gains `regexMatch`, `regexIMatch`, `contains`, `containedBy`, `overlaps`, `rangeGt`, `rangeGte`, `rangeLt`, `rangeLte`, `rangeAdjacent`, `isDistinct`, and `textSearch(column, query, opts?)`, all mirroring `@supabase/postgrest-js`. `ParsedSelect.projection` gains the `'count'` variant for a lone `count(*)`.

- [ ] **Step 1: Write the failing tests**

Append to `package/src/db/parse_where.test.ts`:

```ts
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
    });
});
```

Append to `package/src/db/rest_filters.test.ts`:

```ts
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
        expect(calls).toEqual(operators.map((operator) => `${operator}("a","v")`));
    });

    it('applies not in and text search', () => {
        const { calls, builder } = recorder();
        applyWhere(builder, { kind: 'in', column: 'a', values: [{ kind: 'literal', value: 1 }], negated: true }, []);
        applyWhere(builder, { kind: 'textSearch', column: 'b', value: { kind: 'literal', value: 'cat' }, type: 'plain', config: 'english' }, []);
        expect(calls).toEqual([
            'not("a","in",[1])',
            'textSearch("b","cat",{"type":"plain","config":"english"})',
        ]);
    });

    it('serialises extended operators inside an or() string', () => {
        const { calls, builder } = recorder();
        applyWhere(builder, {
            kind: 'or',
            children: [
                { kind: 'compare', column: 'a', operator: 'contains', value: { kind: 'literal', value: 'x' } },
                { kind: 'in', column: 'b', values: [{ kind: 'literal', value: 1 }], negated: true },
                { kind: 'textSearch', column: 'c', value: { kind: 'literal', value: 'cat' }, type: 'plain' },
            ],
        }, []);
        expect(calls).toEqual(['or("a.cs.x,not.b.in.(1),c.plfts.cat")']);
    });
});
```

Append to `package/src/db/parse_statement.test.ts`:

```ts
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
    });
});
```

Append to `package/src/db/rest_execute.test.ts`:

```ts
it('runs a count(*) select as a head request and returns one positional count', async () => {
    const { client, calls } = stubClient({ data: null, count: 42 });
    const result = await executeRest(
        client,
        { kind: 'select', table: 't', projection: 'count', orderBy: [] },
        [],
    );
    expect(calls[0]!.args).toEqual(['', { count: 'exact', head: true }]);
    expect(result).toEqual({ rows: [[42]], rowCount: 1 });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd package && npx vitest run src/db/parse_where.test.ts src/db/rest_filters.test.ts src/db/parse_statement.test.ts src/db/rest_execute.test.ts --coverage.enabled=false`
Expected: FAIL — the new cases throw `UnsupportedSqlError` (parsers) or record no call (filters).

- [ ] **Step 3: Widen the tokenizer and parser**

In `sql_tokens.ts`, extend `MULTI_CHAR_OPERATORS` — **longest first**, so `-|-` and `~*` win over their prefixes:

```ts
const MULTI_CHAR_OPERATORS = ['-|-', '<>', '!=', '>=', '<=', '~*', '@>', '<@', '&&', '>>', '<<', '&>', '&<', '@@'];
```

Add a tokenizer test asserting `tokenizeSql('a -|- b ~* c @@ d')` yields those as single `punct` tokens.

In `parse_where.ts`:

```ts
const OPERATORS: Record<string, CompareOperator> = {
    '=': 'eq',
    '<>': 'neq',
    '!=': 'neq',
    '>': 'gt',
    '>=': 'gte',
    '<': 'lt',
    '<=': 'lte',
    '~': 'regexMatch',
    '~*': 'regexIMatch',
    '@>': 'contains',
    '<@': 'containedBy',
    '&&': 'overlaps',
    '>>': 'rangeGt',
    '<<': 'rangeLt',
    '&>': 'rangeGte',
    '&<': 'rangeLte',
    '-|-': 'rangeAdjacent',
};

const TS_QUERY_TYPES: Record<string, 'plain' | 'phrase' | 'websearch' | undefined> = {
    to_tsquery: undefined,
    plainto_tsquery: 'plain',
    phraseto_tsquery: 'phrase',
    websearch_to_tsquery: 'websearch',
};
```

In `parseComparison`, before the existing `is null` branch, handle `is [not] distinct from` (returning a `compare`/`not`-wrapped `compare` with operator `isDistinct`); extend the `in` branch to accept a preceding `not` (`negated: true`) and always set `negated`; and add a `@@` branch:

```ts
    if (isPunct(token, '@@')) {
        const call = tokens[index + 1];
        if (call?.kind !== 'word' || !(call.value in TS_QUERY_TYPES)) {
            throw new UnsupportedSqlError(`full-text search via "${describe(call)}"`);
        }
        if (!isPunct(tokens[index + 2], '(')) throw new UnsupportedSqlError('malformed text-search call');
        let cursor = index + 3;
        let config: string | undefined;
        const first = readValue(tokens, cursor);
        cursor = first.next;
        let query = first.value;
        if (isPunct(tokens[cursor], ',')) {
            if (first.value.kind !== 'literal' || typeof first.value.value !== 'string') {
                throw new UnsupportedSqlError('non-literal text-search configuration');
            }
            config = first.value.value;
            const second = readValue(tokens, cursor + 1);
            query = second.value;
            cursor = second.next;
        }
        if (!isPunct(tokens[cursor], ')')) throw new UnsupportedSqlError('unterminated text-search call');
        const node: WhereNode = { kind: 'textSearch', column: column.name, value: query };
        const type = TS_QUERY_TYPES[call.value];
        if (type) node.type = type;
        if (config) node.config = config;
        return { node, next: cursor + 1 };
    }
```

Note: `readColumn` currently rejects a `word` followed by `(` as a function call — `is`/`in`/`not` keywords are unaffected, but confirm the `@@` branch is reached with the left side still a plain column.

In `parse_statement.ts`, widen `ParsedSelect['projection']` to `Projection[] | 'all' | 'count'` and handle a lone `count(*)` at the head of `parseProjection`:

```ts
    if (isWord(tokens[start], 'count') && isPunct(tokens[start + 1], '(') && isPunct(tokens[start + 2], '*') && isPunct(tokens[start + 3], ')')) {
        let next = start + 4;
        if (isWord(tokens[next], 'as')) next = readIdentifier(tokens, next + 1, 'projection alias').next;
        if (!isWord(tokens[next], 'from')) throw new UnsupportedSqlError('`count(*)` combined with other projections');
        return { value: 'count', next };
    }
```

- [ ] **Step 4: Widen the REST layer**

In `rest_filters.ts`: add the new methods to `FilterTarget`; add a `textSearch` branch and a `negated` branch for `in` to `applyWhere`; and extend serialisation with PostgREST's operator codes:

```ts
const FILTER_CODES: Record<CompareOperator, string> = {
    eq: 'eq', neq: 'neq', gt: 'gt', gte: 'gte', lt: 'lt', lte: 'lte',
    like: 'like', ilike: 'ilike',
    regexMatch: 'match', regexIMatch: 'imatch',
    contains: 'cs', containedBy: 'cd', overlaps: 'ov',
    rangeGt: 'sr', rangeGte: 'nxl', rangeLt: 'sl', rangeLte: 'nxr', rangeAdjacent: 'adj',
    isDistinct: 'isdistinct',
};

const TEXT_SEARCH_CODES = { plain: 'plfts', phrase: 'phfts', websearch: 'wfts' } as const;
```

`serialize` uses `FILTER_CODES` in place of `NEGATABLE`, prefixes a negated `in` with `not.`, and renders a `textSearch` node as `` `${column}.${code}${config ? `(${config})` : ''}.${encodeFilterValue(query)}` `` where `code` is `TEXT_SEARCH_CODES[type]` or `fts` when `type` is undefined.

In `rest_execute.ts`: handle `projection === 'count'` — request `select('', { count: 'exact', head: true })`, apply the `where`, then return `{ rows: [[count]], rowCount: 1 }`. Leave `'all'` rejecting as before, and keep `columnList`/`projectionOf` rejecting `'count'` for mutation `returning` lists.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd package && npx vitest run src/db --coverage.enabled=false`
Expected: PASS, including all Task 3/4/6/8 tests unchanged apart from the `in` node's new `negated` field.

- [ ] **Step 6: Check per-file coverage**

Run: `cd package && npx vitest run src/db --coverage.include='src/db/parse_where.ts' --coverage.include='src/db/rest_filters.ts' --coverage.include='src/db/rest_execute.ts' --coverage.include='src/db/parse_statement.ts'`
Expected: 100% on all four. Every `throw` added here needs its own rejection case.

- [ ] **Step 7: Commit**

```bash
git add package/src/db
git commit -m "feat: cover the full postgrest-js operator set in SQL translation"
```

- [ ] **Step 8: Update the docs written in Task 12**

Add the extended operator table and the `count(*)` case to the README/`llms.txt` subset section and to `.agent/.sub-rules/packages/db.md`, plus the always-unsupported list from Spec §6a.

```bash
git add package/README.md package/llms.txt .agent/.sub-rules/packages/db.md
git commit -m "docs: list the full translated operator set"
```

---

## Verification

- [ ] `cd package && npm test` — all suites pass, per-file coverage 100% for every file created here.
- [ ] `cd package && npm run build` — `tsc` clean.
- [ ] `npx eslint .` at the repo root — clean.
- [ ] `grep -rn "supabaseSelect" package/src package/README.md package/llms.txt example` — no hits.
- [ ] Manual smoke against a real project with `rawSql: false`: `db.select().from(t).where(eq(t.id, 1)).limit(5)` returns rows; `db.select({ n: count() }).from(t)` returns the count; `db.select().from(a).innerJoin(b, …)` throws the message naming `join`.
