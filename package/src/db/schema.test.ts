import { describe, it, expect } from 'vitest';
import { pgTable, varchar, integer, index, sql } from './schema.js';

describe('dbSchema', () => {
	it('re-exports pg-core table builders', () => {
		const table = pgTable('widgets', {
			id: integer('id').primaryKey(),
			name: varchar('name', { length: 32 }),
		});

		expect(table.id.name).toBe('id');
		expect(table.name.name).toBe('name');
	});

	it('re-exports pg-core index builders', () => {
		expect(typeof index).toBe('function');
	});

	it('re-exports the sql tag', () => {
		expect(sql`select 1`.queryChunks.length).toBeGreaterThan(0);
	});
});
