import { bench, describe } from 'vitest';
import tokenizeSql from './sql_tokens.js';
import parseStatement from './parse_statement.js';
import inlineParams from './inline_params.js';
import encodeParam from './encode_param.js';
import parseWhere from './parse_where.js';
import parseComposite from './parse_composite.js';
import buildRestFilters, { type FilterTarget } from './rest_filters.js';
import resolveRawSql from './resolve_raw_sql.js';
import { parseExecResult } from './supabase_transport.js';
import { excluded, onConflictSet } from './helpers.js';
import { pgTable, text, integer, timestamp } from 'drizzle-orm/pg-core';

describe('DB Module Branch Benchmarks', () => {
    const complexSql = 'SELECT id, name, email, created_at FROM users WHERE status = $1 AND age >= $2 AND role IN ($3, $4) ORDER BY created_at DESC LIMIT $5 OFFSET $6';
    const insertSql = 'INSERT INTO users ("name", "email", "age", "status") VALUES ($1, $2, $3, $4), ($5, $6, $7, $8) ON CONFLICT ("email") DO UPDATE SET "name" = excluded."name", "status" = $9 RETURNING "id", "name"';
    const updateSql = 'UPDATE users SET name = $1, status = $2 WHERE id = $3 AND active = $4 RETURNING id';
    const deleteSql = 'DELETE FROM users WHERE tenant_id = $1 AND status = $2 AND created_at < $3 RETURNING id';

    const sampleParams = ['active', 21, 'admin', 'user', 50, 10, 'John Doe', 'john@example.com', 30, 'pending'];

    // Schema for helpers benchmarks
    const usersTable = pgTable('users', {
        id: integer('id').primaryKey(),
        name: text('name').notNull(),
        email: text('email').notNull(),
        updatedAt: timestamp('updated_at'),
    });

    const mockTarget = {
        eq: () => mockTarget,
        gte: () => mockTarget,
        in: () => mockTarget,
        or: () => mockTarget,
    } as unknown as FilterTarget;

    const sampleWhereTree = {
        kind: 'and' as const,
        children: [
            { kind: 'compare' as const, column: 'status', operator: 'eq' as const, value: { kind: 'param' as const, index: 1 } },
            { kind: 'compare' as const, column: 'age', operator: 'gte' as const, value: { kind: 'param' as const, index: 2 } },
            { kind: 'in' as const, column: 'role', values: [{ kind: 'param' as const, index: 3 }, { kind: 'param' as const, index: 4 }], negated: false }
        ]
    };

    // 1. Tokenizer benchmarks
    describe('tokenizeSql', () => {
        bench('Select statement', () => { tokenizeSql(complexSql); });
        bench('Insert statement', () => { tokenizeSql(insertSql); });
        bench('Update statement', () => { tokenizeSql(updateSql); });
        bench('Delete statement', () => { tokenizeSql(deleteSql); });
    });

    // 2. Parser benchmarks
    describe('parseStatement', () => {
        bench('Select statement', () => { parseStatement(complexSql); });
        bench('Insert statement', () => { parseStatement(insertSql); });
        bench('Update statement', () => { parseStatement(updateSql); });
        bench('Delete statement', () => { parseStatement(deleteSql); });
    });

    // 3. Where Clause parser
    describe('parseWhere', () => {
        const tokens = tokenizeSql(complexSql);
        // "status = $1 AND age >= $2 AND role IN ($3, $4)" starts at token index 11 (WHERE token is at index 10)
        bench('Where clause parsing', () => {
            parseWhere(tokens, 11);
        });
    });

    // 4. Parameter inlining
    describe('inlineParams', () => {
        bench('Select with 6 params', () => { inlineParams(complexSql, sampleParams); });
        bench('Insert with 9 params', () => { inlineParams(insertSql, sampleParams); });
    });

    // 5. Parameter encoding
    describe('encodeParam', () => {
        bench('String encoding', () => { encodeParam('test string with \'quotes\' and \\ backslashes'); });
        bench('Number encoding', () => { encodeParam(12345.678); });
        bench('Boolean encoding', () => { encodeParam(true); });
        bench('Date encoding', () => { encodeParam(new Date('2026-01-01T12:00:00Z')); });
        bench('JSON Object encoding', () => { encodeParam({ a: 1, b: 'hello', c: [true, false] }); });
        bench('Array encoding', () => { encodeParam(['foo', 'bar', 'baz']); });
        bench('Uint8Array encoding', () => { encodeParam(new Uint8Array([1, 2, 3, 4, 255])); });
        bench('Mixed realistic param batch', () => {
            encodeParam('jane@example.com');
            encodeParam(42);
            encodeParam('active');
            encodeParam(new Date('2026-01-01T00:00:00Z'));
            encodeParam(null);
            encodeParam(true);
            encodeParam('another string value');
        });
    });

    // 6. Composite type parsing
    describe('parseComposite', () => {
        bench('Simple composite row', () => { parseComposite('(123,"hello",t,"2026-01-01")'); });
        bench('Escaped quoted composite row', () => { parseComposite('(123,"hello ""world""",t,"2026-01-01")'); });
    });

    // 7. REST Filters builder
    describe('buildRestFilters', () => {
        bench('Where tree translation', () => {
            buildRestFilters(mockTarget, sampleWhereTree, sampleParams);
        });
    });

    // 8. Result Decoder
    describe('parseExecResult', () => {
        const sampleResult = [
            '(1,"John Doe","john@example.com","2026-01-01")',
            '(2,"Jane Doe","jane@example.com","2026-01-02")',
            '(3,"Bob Smith","bob@example.com","2026-01-03")',
        ];
        bench('Parse RPC array result', () => {
            parseExecResult(sampleResult);
        });
    });

    // 9. Drizzle Helpers
    describe('helpers', () => {
        const exUsers = excluded(usersTable);
        bench('excluded column lookup', () => {
            void exUsers.name;
            void exUsers.email;
        });

        bench('onConflictSet generation', () => {
            onConflictSet(usersTable, ['name', 'email']);
        });
    });

    // 10. Raw SQL Resolution
    describe('resolveRawSql', () => {
        bench('Next.config lookup', () => {
            resolveRawSql('/Volumes/External/own_projects/cloudflare-next-intl');
        });
    });
});
