import { describe, it, expect } from 'vitest';
import inlineParams from './inline_params';

describe('inlineParams', () => {
    it('substitutes a single placeholder', () => {
        expect(inlineParams('select * from t where id = $1', [5])).toBe('select * from t where id = 5');
    });

    it('substitutes multiple placeholders regardless of order', () => {
        expect(inlineParams('select $2, $1', ['a', 'b'])).toBe("select 'b', 'a'");
    });

    it('handles two-digit placeholder indices', () => {
        const params = Array.from({ length: 10 }, (_, i) => i + 1);
        expect(inlineParams('select $10, $1', params)).toBe('select 10, 1');
    });

    it('leaves placeholder-like text inside single-quoted strings untouched', () => {
        expect(inlineParams("select 'literal $1' from t where id = $1", [5])).toBe("select 'literal $1' from t where id = 5");
    });

    it('handles doubled single quotes inside string literals', () => {
        expect(inlineParams("select 'it''s $1' where id = $1", [5])).toBe("select 'it''s $1' where id = 5");
    });

    it('leaves placeholder-like text inside double-quoted identifiers untouched', () => {
        expect(inlineParams('select "col$1" from t where id = $1', [5])).toBe('select "col$1" from t where id = 5');
    });

    it('handles a doubled double-quote inside a quoted identifier', () => {
        expect(inlineParams('select "col""1" where id = $1', [5])).toBe('select "col""1" where id = 5');
    });

    it('handles a backslash inside a single-quoted string', () => {
        expect(inlineParams("select 'a\\\\b $1' where id = $1", [5])).toBe("select 'a\\\\b $1' where id = 5");
    });

    it('treats an unterminated quoted identifier as running to the end of the statement', () => {
        expect(inlineParams('select "unterminated', [])).toBe('select "unterminated');
    });

    it('treats an unterminated single-quoted string as running to the end of the statement', () => {
        expect(inlineParams("select 'unterminated", [])).toBe("select 'unterminated");
    });

    it('leaves placeholder-like text inside an E-prefixed escape string untouched', () => {
        expect(inlineParams("select E'literal $1' where id = $1", [5])).toBe("select E'literal $1' where id = 5");
    });

    it('leaves a trailing bare $ at the end of the statement untouched', () => {
        expect(inlineParams('select $', [])).toBe('select $');
    });

    it('treats a $ not starting a placeholder or a valid dollar-quote tag as a literal character', () => {
        expect(inlineParams('select $!foo', [])).toBe('select $!foo');
    });

    it('treats an unterminated dollar-quoted body as running to the end of the statement', () => {
        expect(inlineParams('do $$ unterminated', [])).toBe('do $$ unterminated');
    });

    it('treats an unterminated line comment as running to the end of the statement', () => {
        expect(inlineParams('select 1 -- trailing comment, no newline', [])).toBe('select 1 -- trailing comment, no newline');
    });

    it('treats an unterminated block comment as running to the end of the statement', () => {
        expect(inlineParams('select 1 /* unterminated', [])).toBe('select 1 /* unterminated');
    });

    it('leaves placeholder-like text inside line comments untouched', () => {
        expect(inlineParams('select $1 -- not $2\n, $2', ['a', 'b'])).toBe("select 'a' -- not $2\n, 'b'");
    });

    it('leaves placeholder-like text inside block comments untouched', () => {
        expect(inlineParams('select $1 /* not $2 */ , $2', ['a', 'b'])).toBe("select 'a' /* not $2 */ , 'b'");
    });

    it('leaves dollar-quoted bodies untouched, including a tagged body containing $1', () => {
        expect(inlineParams('do $$ select $1; $$ , $1', ['x'])).toBe("do $$ select $1; $$ , 'x'");
        expect(inlineParams('do $tag$ select $1; $tag$ , $1', ['x'])).toBe("do $tag$ select $1; $tag$ , 'x'");
    });

    it('throws when a placeholder has no matching param', () => {
        expect(() => inlineParams('select $2', ['only-one'])).toThrow(/\$2/);
    });

    it('encodes null and array params through encodeParam', () => {
        expect(inlineParams('select $1, $2', [null, [1, 2]])).toBe("select NULL, '{1,2}'");
    });
});
