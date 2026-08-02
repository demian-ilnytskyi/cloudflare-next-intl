import { describe, it, expect } from 'vitest';
import stringifyUnknown from './stringify_unknown';

describe('stringifyUnknown', () => {
    it('returns strings as-is', () => {
        expect(stringifyUnknown('boom')).toBe('boom');
    });

    it('formats an Error with name, message, and stack', () => {
        const error = new Error('boom');
        expect(stringifyUnknown(error)).toContain('Error: boom');
    });

    it('formats an Error with no stack property', () => {
        const error = new Error('boom');
        delete (error as { stack?: string }).stack;
        expect(stringifyUnknown(error)).toBe('Error: boom\n\n');
    });

    it('resolves a function-wrapped error on the server', () => {
        expect(stringifyUnknown(() => 'lazy boom')).toBe('lazy boom');
    });

    it('does not resolve function-wrapped errors on the client', () => {
        expect(stringifyUnknown(() => 'lazy boom', true)).toBe('[Function]');
    });

    it('pretty-prints plain objects', () => {
        expect(stringifyUnknown({ a: 1 })).toBe(JSON.stringify({ a: 1 }, null, 2));
    });

    it('falls back to a plain string for circular objects when nested', () => {
        const circular: Record<string, unknown> = {};
        circular.self = circular;
        expect(stringifyUnknown(circular, false, true)).toBe('[Unserializable value]');
    });

    it('returns [Function] when a function still resolves to a function after all resolution attempts', () => {
        const alwaysReturnsFunction = () => alwaysReturnsFunction;
        expect(stringifyUnknown(alwaysReturnsFunction)).toBe('[Function]');
    });

    it('returns an error string when resolving a function-wrapped error throws', () => {
        const throwing = () => { throw new Error('resolution failed'); };
        expect(stringifyUnknown(throwing)).toContain('Error during function resolution:');
    });
});
