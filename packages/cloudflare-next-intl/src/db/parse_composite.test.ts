import { describe, it, expect } from 'vitest';
import parseComposite from './parse_composite.js';

describe('parseComposite', () => {
    it('parses bare unquoted fields', () => {
        expect(parseComposite('(1,a1,2,b2)')).toEqual(['1', 'a1', '2', 'b2']);
    });

    it('parses a single field', () => {
        expect(parseComposite('(1)')).toEqual(['1']);
    });

    it('treats an empty bare field as null', () => {
        expect(parseComposite('(1,,3)')).toEqual(['1', null, '3']);
    });

    it('unquotes a quoted field', () => {
        expect(parseComposite('("hi,there")')).toEqual(['hi,there']);
    });

    it('unescapes doubled quotes inside a quoted field', () => {
        expect(parseComposite('("quo""te")')).toEqual(['quo"te']);
    });

    it('parses a pg array literal field alongside scalars', () => {
        expect(parseComposite('("{1,2,3}",t,1.10,"2026-08-23 08:54:54.884704+00",)')).toEqual([
            '{1,2,3}',
            't',
            '1.10',
            '2026-08-23 08:54:54.884704+00',
            null,
        ]);
    });

    it('parses an empty array field', () => {
        expect(parseComposite('(,{},"{a,""b,c""}")')).toEqual([null, '{}', '{a,"b,c"}']);
    });

    it('parses duplicate-shaped fields from a join', () => {
        expect(parseComposite('(1,a1,2,b2)')).toHaveLength(4);
    });

    it('parses an empty composite (no columns) as no fields', () => {
        expect(parseComposite('()')).toEqual([]);
    });
});
