import { describe, it, expect, vi, afterEach } from 'vitest';
import stringifyUnknown from './stringify_unknown.js';

describe('stringifyUnknown', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns "undefined" for undefined input', () => {
        expect(stringifyUnknown(undefined)).toBe('undefined');
    });

    it('returns "null" for null input', () => {
        expect(stringifyUnknown(null)).toBe('null');
    });

    it('returns strings as-is', () => {
        expect(stringifyUnknown('boom')).toBe('boom');
    });

    it('strips ANSI color escape codes from strings (e.g. Next.js pretty-printed terminal errors)', () => {
        expect(stringifyUnknown('[31m⨯ boom[39m')).toBe('⨯ boom');
    });

    it('strips ANSI color escape codes from an Error message/stack', () => {
        const error = new Error('[31mboom[39m');
        error.stack = '[31mError: boom[39m\n[31m    at foo[39m';
        const result = stringifyUnknown(error);
        expect(result).not.toContain('[');
        expect(result).toContain('boom');
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

    it('resolves a function-wrapped error on the client too', () => {
        expect(stringifyUnknown(() => 'lazy boom', true)).toBe('lazy boom');
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

    it('returns an error string and warns when resolving a function-wrapped error throws', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const throwing = () => { throw new Error('resolution failed'); };
        const result = stringifyUnknown(throwing);
        expect(result).toContain('Error during function resolution:');
        expect(warnSpy).toHaveBeenCalledWith(result);
    });

    it('returns an error string and warns when resolving a function-wrapped error throws on the client', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const throwing = () => { throw new Error('resolution failed'); };
        const result = stringifyUnknown(throwing, true);
        expect(result).toContain('Error during function resolution:');
        expect(warnSpy).toHaveBeenCalledWith(result);
    });

    it('returns [Function] when a function still resolves to a function on the client', () => {
        const alwaysReturnsFunction = () => alwaysReturnsFunction;
        expect(stringifyUnknown(alwaysReturnsFunction, true)).toBe('[Function]');
    });

    it('never calls a React-internal tagged reference (e.g. a temporary/client reference React substitutes for a value that could not cross the RSC boundary) — calling it is guaranteed to throw by design', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const temporaryReference = Object.defineProperties(
            function unreachable() {
                throw new Error('Attempted to call a temporary Client Reference from the server but it is on the client.');
            },
            { $$typeof: { value: Symbol.for('react.temporary.reference') } },
        );

        const result = stringifyUnknown(temporaryReference);

        expect(result).toBe('[React internal reference could not be resolved to a value]');
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('never calls a React-internal tagged reference nested inside the resolution loop', () => {
        const temporaryReference = Object.defineProperties(
            function unreachable() {
                throw new Error('must not be called');
            },
            { $$typeof: { value: Symbol.for('react.temporary.reference') } },
        );
        const lazyWrapper = () => temporaryReference;

        expect(stringifyUnknown(lazyWrapper)).toBe('[React internal reference could not be resolved to a value]');
    });
});
