import { describe, it, expect } from 'vitest';
import { drizzle } from 'drizzle-orm/pg-proxy';
import { pgTable, text, integer, numeric, timestamp } from 'drizzle-orm/pg-core';
import { eq, and, sql } from 'drizzle-orm';

/**
 * Exercises the real (unmocked) `drizzle-orm/pg-proxy` driver the way
 * `buildOnlyDb()` in context.ts constructs it, against query shapes copied
 * from actual CRV repository files (consumption_record_repository.ts,
 * audit_draft_repository.ts, audit_log.ts) — `.insert().values()
 * .onConflictDoNothing().toSQL()`, `.onConflictDoUpdate().returning()
 * .toSQL()`, `.delete().where().toSQL()`, and a plain `.select()` — to make
 * sure a driver that only throws on execute (not on every property access)
 * still lets every one of these chains build to completion.
 */
function throwingDriver(): never {
    throw new Error(
        'db: this Drizzle handle is for building statements only — call `.toSQL()` on each ' +
        'query and return the array, do not `await`/execute it directly. Awaiting a query ' +
        'inside a Supabase-mode db.transaction() callback runs it outside the batch, with no ' +
        'atomicity, which is exactly what `.transaction()` exists to prevent.',
    );
}

function buildOnlyDb() {
    return drizzle(throwingDriver);
}

const profiles = pgTable('profiles', {
    id: text('id').primaryKey(),
    email: text('email'),
});

const consumptionHistory = pgTable('consumption_history', {
    id: integer('id').primaryKey(),
    ownerId: text('owner_id').notNull(),
    resource: text('resource').notNull(),
    periodMonth: text('period_month').notNull(),
    quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
});

const auditDrafts = pgTable('audit_drafts', {
    contractorId: text('contractor_id').notNull(),
    propertyId: integer('property_id').notNull(),
    step: integer('step').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
});

const auditLog = pgTable('audit_log', {
    id: integer('id').primaryKey(),
    contractorId: text('contractor_id').notNull(),
    eventType: text('event_type').notNull(),
});

describe('buildOnlyDb (real pg-proxy driver, no mocks)', () => {
    it('builds an onConflictDoNothing upsert (saveConsumptionHistory profile sync) without executing', () => {
        const db = buildOnlyDb();
        const query = db
            .insert(profiles)
            .values({ id: 'owner-1' })
            .onConflictDoNothing({ target: profiles.id })
            .toSQL();

        expect(query.sql).toMatch(/insert into "profiles"/i);
        expect(query.sql).toMatch(/on conflict .* do nothing/i);
    });

    it('builds a multi-row insert (saveConsumptionHistory entries) without executing', () => {
        const db = buildOnlyDb();
        const query = db
            .insert(consumptionHistory)
            .values([
                { id: 1, ownerId: 'owner-1', resource: 'electricity', periodMonth: '2026-07-01', quantity: '12.500' },
                { id: 2, ownerId: 'owner-1', resource: 'water', periodMonth: '2026-07-01', quantity: '3.250' },
            ])
            .toSQL();

        expect(query.sql).toMatch(/insert into "consumption_history"/i);
        expect(query.params).toHaveLength(10);
    });

    it('builds an onConflictDoUpdate with returning (saveAuditDraft upsert) without executing', () => {
        const db = buildOnlyDb();
        const query = db
            .insert(auditDrafts)
            .values({ contractorId: 'c1', propertyId: 42, step: 2, updatedAt: new Date('2026-08-01T00:00:00Z') })
            .onConflictDoUpdate({
                target: [auditDrafts.contractorId, auditDrafts.propertyId],
                set: { step: 2 },
            })
            .returning({ updatedAt: auditDrafts.updatedAt })
            .toSQL();

        expect(query.sql).toMatch(/insert into "audit_drafts"/i);
        expect(query.sql).toMatch(/on conflict .* do update/i);
        expect(query.sql).toMatch(/returning "updated_at"/i);
    });

    it('builds a delete with a compound where (clearAuditDraft) without executing', () => {
        const db = buildOnlyDb();
        const query = db
            .delete(auditDrafts)
            .where(and(eq(auditDrafts.contractorId, 'c1'), eq(auditDrafts.propertyId, 42)))
            .toSQL();

        expect(query.sql).toMatch(/delete from "audit_drafts"/i);
        expect(query.sql).toMatch(/where/i);
        expect(query.params).toEqual(['c1', 42]);
    });

    it('builds a log_event-style insert with a jsonb payload (logEventQuery) without executing', () => {
        const db = buildOnlyDb();
        const query = db
            .insert(auditLog)
            .values({ id: 1, contractorId: 'c1', eventType: 'consumption_history_submitted' })
            .returning({ id: auditLog.id })
            .toSQL();

        expect(query.sql).toMatch(/insert into "audit_log"/i);
        expect(query.sql).toMatch(/returning "id"/i);
    });

    it('builds a select with filters and raw sql fragments (listConsumptionHistory) without executing', () => {
        const db = buildOnlyDb();
        const isCurrent = sql<boolean>`not exists (select 1 from consumption_history c2 where c2.owner_id = consumption_history.owner_id)`;
        const query = db
            .select({ id: consumptionHistory.id, isCurrent })
            .from(consumptionHistory)
            .where(eq(consumptionHistory.ownerId, 'owner-1'))
            .limit(20)
            .offset(0)
            .toSQL();

        expect(query.sql).toMatch(/select/i);
        expect(query.sql).toMatch(/not exists/i);
        expect(query.sql).toMatch(/limit/i);
    });

    // pg-proxy wraps the driver's throw as `Failed query: ...` with the
    // driver's own error attached as `.cause` — the build-only message
    // itself surfaces there, not in the top-level thrown message.
    it('throws with the build-only reason on .cause when a built query is awaited directly', async () => {
        const db = buildOnlyDb();
        try {
            await db.insert(profiles).values({ id: 'owner-1' });
            expect.unreachable('expected the query to reject');
        } catch (error) {
            expect((error as Error).message).toMatch(/^Failed query:/);
            expect((error as { cause?: Error }).cause?.message).toMatch(/for building statements only/);
            expect((error as { cause?: Error }).cause?.message).toMatch(/do not `await`\/execute it directly/);
        }
    });

    it('throws with the build-only reason on .cause for a select awaited directly', async () => {
        const db = buildOnlyDb();
        try {
            await db.select().from(consumptionHistory).where(eq(consumptionHistory.ownerId, 'owner-1'));
            expect.unreachable('expected the query to reject');
        } catch (error) {
            expect((error as { cause?: Error }).cause?.message).toMatch(/for building statements only/);
        }
    });

    it('does not throw merely from accessing or chaining builder methods — only from execution', () => {
        const db = buildOnlyDb();
        expect(() => db.insert(profiles).values({ id: 'owner-1' }).onConflictDoNothing({ target: profiles.id })).not.toThrow();
        expect(() => db.select().from(consumptionHistory)).not.toThrow();
        expect(() => db.delete(auditDrafts).where(eq(auditDrafts.contractorId, 'c1'))).not.toThrow();
    });

    // Mirrors context.ts's `callBuild`, which unwraps pg-proxy's `Failed
    // query: ...` wrapper so a caller sees the build-only guidance directly
    // rather than the generic wrapper text — kept here since context.test.ts
    // mocks `drizzle-orm/pg-proxy` and can't exercise the real wrapping.
    it('the real pg-proxy wrapper is unwrappable via .cause, matching callBuild in context.ts', async () => {
        const db = buildOnlyDb();
        const runLikeCallBuild = async (build: (d: typeof db) => Promise<unknown> | unknown) => {
            try {
                return await build(db);
            } catch (error) {
                const cause = (error as { cause?: unknown })?.cause;
                if (error instanceof Error && cause instanceof Error) throw cause;
                throw error;
            }
        };

        await expect(runLikeCallBuild((d) => d.insert(profiles).values({ id: 'owner-1' }))).rejects.toThrow(
            /for building statements only/,
        );
    });
});
