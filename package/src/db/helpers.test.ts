import { describe, it, expect } from 'vitest';
import { pgTable, real, timestamp, varchar } from 'drizzle-orm/pg-core';
import {
	excluded,
	onConflictSet,
	now,
	ago,
	fromNow,
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
	scalarFrom,
	eq,
	and,
	or,
	asc,
	desc,
	gte,
	gt,
	lte,
	lt,
	isNull,
	isNotNull,
	count,
	sum,
	max,
	min,
	sql,
	inArray,
	notInArray,
	ne,
	like,
	ilike,
	between,
	not,
	exists,
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
		expect(now()).toBeDefined();
		expect(ago(10, 'days')).toBeDefined();
		expect(fromNow(10, 'days')).toBeDefined();
		expect(currentDate()).toBeDefined();
		expect(windowCount()).toBeDefined();
		expect(unnestLateral(sample.price, 'cd')).toBeDefined();
		expect(ascNullsLast(sample.price)).toBeDefined();
		expect(alwaysTrue()).toBeDefined();
		expect(lateral(minOf(aliasColumn('c', 'x')), 'c')).toBeDefined();
		expect(maxOf(aliasColumn('c', 'x'))).toBeDefined();
		expect(roundReal(multiply(minOf(sample.price), 100), 2)).toBeDefined();
		expect(scalarFromCte('filtered', maxOf(sample.price))).toBeDefined();
		expect(scalarFrom(sql.raw('filtered'), maxOf(sample.price))).toBeDefined();
	});
});

describe('re-exported drizzle-orm operators', () => {
	it('build query predicates/aggregates without throwing', () => {
		expect(eq(sample.price, 1)).toBeDefined();
		expect(and(eq(sample.price, 1), eq(sample.isin, 'x'))).toBeDefined();
		expect(or(eq(sample.price, 1), eq(sample.isin, 'x'))).toBeDefined();
		expect(asc(sample.price)).toBeDefined();
		expect(desc(sample.price)).toBeDefined();
		expect(gte(sample.price, 1)).toBeDefined();
		expect(gt(sample.price, 1)).toBeDefined();
		expect(lte(sample.price, 1)).toBeDefined();
		expect(lt(sample.price, 1)).toBeDefined();
		expect(isNull(sample.price)).toBeDefined();
		expect(isNotNull(sample.price)).toBeDefined();
		expect(count(sample.price)).toBeDefined();
		expect(sum(sample.price)).toBeDefined();
		expect(max(sample.price)).toBeDefined();
		expect(min(sample.price)).toBeDefined();
		expect(sql`now()`).toBeDefined();
		expect(inArray(sample.isin, ['a', 'b'])).toBeDefined();
		expect(notInArray(sample.isin, ['a', 'b'])).toBeDefined();
		expect(ne(sample.price, 1)).toBeDefined();
		expect(like(sample.isin, '%a%')).toBeDefined();
		expect(ilike(sample.isin, '%a%')).toBeDefined();
		expect(between(sample.price, 1, 2)).toBeDefined();
		expect(not(eq(sample.price, 1))).toBeDefined();
		expect(typeof exists).toBe('function');
	});
});
