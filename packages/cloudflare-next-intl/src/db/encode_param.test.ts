import { describe, it, expect } from 'vitest';
import encodeParam from './encode_param.js';

describe('encodeParam', () => {
    it('encodes null and undefined as NULL', () => {
        expect(encodeParam(null)).toBe('NULL');
        expect(encodeParam(undefined)).toBe('NULL');
    });

    it('encodes booleans as bare literals', () => {
        expect(encodeParam(true)).toBe('true');
        expect(encodeParam(false)).toBe('false');
    });

    it('encodes numbers and bigints as bare literals', () => {
        expect(encodeParam(42)).toBe('42');
        expect(encodeParam(-3.5)).toBe('-3.5');
        expect(encodeParam(10n)).toBe('10');
    });

    it('quotes non-finite numbers', () => {
        expect(encodeParam(NaN)).toBe("'NaN'");
        expect(encodeParam(Infinity)).toBe("'Infinity'");
        expect(encodeParam(-Infinity)).toBe("'-Infinity'");
    });

    it('quotes strings and doubles embedded single quotes', () => {
        expect(encodeParam('hello')).toBe("'hello'");
        expect(encodeParam("o'brien")).toBe("'o''brien'");
    });

    it('encodes dates as quoted ISO strings', () => {
        expect(encodeParam(new Date('2024-01-02T03:04:05.000Z'))).toBe("'2024-01-02T03:04:05.000Z'");
    });

    it('encodes Uint8Array as a quoted hex-escaped bytea literal', () => {
        expect(encodeParam(new Uint8Array([0, 255, 16]))).toBe("'\\x00ff10'");
    });

    it('encodes plain objects as quoted JSON', () => {
        expect(encodeParam({ a: 1 })).toBe('\'{"a":1}\'');
    });

    it('encodes number arrays as a pg array literal', () => {
        expect(encodeParam([1, 2, 3])).toBe("'{1,2,3}'");
    });

    it('encodes string arrays with quoted, escaped elements', () => {
        expect(encodeParam(['a', 'b,c', 'd"e'])).toBe('\'{"a","b,c","d\\"e"}\'');
    });

    it('encodes nested arrays', () => {
        expect(encodeParam([[1, 2], [3, 4]])).toBe("'{{1,2},{3,4}}'");
    });

    it('encodes null elements inside arrays as NULL', () => {
        expect(encodeParam([1, null, 3])).toBe("'{1,NULL,3}'");
    });

    it('encodes Date elements inside arrays as quoted ISO strings', () => {
        expect(encodeParam([new Date('2024-01-02T03:04:05.000Z')])).toBe("'{\"2024-01-02T03:04:05.000Z\"}'");
    });

    it('encodes plain-object elements inside arrays as quoted JSON', () => {
        expect(encodeParam([{ a: 1 }])).toBe('\'{"{\\"a\\":1}"}\'');
    });
});
