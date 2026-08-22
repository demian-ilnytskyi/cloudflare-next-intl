import { describe, it, expect } from 'vitest';
import { pgTable, real, timestamp, varchar } from 'drizzle-orm/pg-core';
import {
	excluded,
	onConflictSet,
	ago,
	currentDate,
	windowCount,
	unnestLateral,
	ascNullsLast,
	alwaysTrue,
	lateral,
	aliasColumn,
	minOf,
	maxOf,
	roundReal,
	multiply,
	scalarFromCte,
} from './helpers';

const sample = pgTable('sample', {
	isin: varchar().primaryKey(),
	price: real(),
	updatedAt: timestamp('updated_at'),
});

const sampleNoUpdatedAt = pgTable('sample_no_updated_at', {
	isin: varchar().primaryKey(),
	price: real(),
});

describe('excluded()', () => {
	it('returns an expression for a valid column', () => {
		expect(excluded(sample).price).toBeDefined();
	});

	it('throws for an unknown column', () => {
		expect(() => (excluded(sample) as never as Record<string, unknown>).nope).toThrow(
			/Column "nope" does not exist on table "sample"/,
		);
	});
});

describe('onConflictSet()', () => {
	it('maps fields and appends updatedAt', () => {
		const set = onConflictSet(sample, ['price']);
		expect(set).toHaveProperty('price');
		expect(set).toHaveProperty('updatedAt');
	});

	it('throws for an unknown field', () => {
		expect(() => onConflictSet(sample, ['nope' as never])).toThrow(/does not exist/);
	});

	it('omits updatedAt when column does not exist on table', () => {
		const set = onConflictSet(sampleNoUpdatedAt, ['price']);
		expect(set).toHaveProperty('price');
		expect(set).not.toHaveProperty('updatedAt');
	});
});

describe('sql expression helpers', () => {
	it('build without throwing', () => {
		expect(ago(10, 'days')).toBeDefined();
		expect(currentDate()).toBeDefined();
		expect(windowCount()).toBeDefined();
		expect(unnestLateral(sample.price, 'cd')).toBeDefined();
		expect(ascNullsLast(sample.price)).toBeDefined();
		expect(alwaysTrue()).toBeDefined();
		expect(lateral(minOf(aliasColumn('c', 'x')), 'c')).toBeDefined();
		expect(maxOf(aliasColumn('c', 'x'))).toBeDefined();
		expect(roundReal(multiply(minOf(sample.price), 100), 2)).toBeDefined();
		expect(scalarFromCte('filtered', maxOf(sample.price))).toBeDefined();
	});
});
