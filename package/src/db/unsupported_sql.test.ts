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
