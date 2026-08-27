import { describe, expect, it, afterEach } from 'vitest';
import isStaleDeployError, {
    defaultStaleDeployPatterns,
    getStaleDeployPatterns,
    setStaleDeployPatterns,
} from './is_stale_deploy_error';

describe('isStaleDeployError', () => {
    afterEach(() => {
        setStaleDeployPatterns(defaultStaleDeployPatterns);
    });

    it('exports defaultStaleDeployPatterns with expected defaults', () => {
        expect(defaultStaleDeployPatterns).toEqual([
            'chunk',
            'failed to fetch',
            'loading css chunk',
            'connection closed',
            'rsc payload',
            'minified react error #412',
        ]);
        expect(getStaleDeployPatterns()).toEqual(defaultStaleDeployPatterns);
    });

    it('allows setting active patterns globally via setter', () => {
        setStaleDeployPatterns(['custom-marker', 'another-error']);
        expect(getStaleDeployPatterns()).toEqual(['custom-marker', 'another-error']);

        const error = new Error('Encountered custom-marker failure');
        expect(isStaleDeployError(error)).toBe(true);

        const oldDefaultError = new Error('Connection closed by server');
        expect(isStaleDeployError(oldDefaultError)).toBe(false);
    });

    it('returns false for falsy error values', () => {
        expect(isStaleDeployError(null as unknown as Error)).toBe(false);
        expect(isStaleDeployError(undefined as unknown as Error)).toBe(false);
    });

    it('returns true when error name is ChunkLoadError regardless of message or patterns', () => {
        const error = new Error('Random message');
        error.name = 'ChunkLoadError';
        expect(isStaleDeployError(error)).toBe(true);
        expect(isStaleDeployError(error, [])).toBe(true);
    });

    it('returns true for default matching error message substrings', () => {
        expect(isStaleDeployError(new Error('Failed to load chunk 123'))).toBe(true);
        expect(isStaleDeployError(new Error('TypeError: Failed to fetch'))).toBe(true);
        expect(isStaleDeployError(new Error('Error: Loading CSS chunk failed'))).toBe(true);
        expect(isStaleDeployError(new Error('Connection closed by server'))).toBe(true);
        expect(isStaleDeployError(new Error('Failed to parse RSC payload'))).toBe(true);
        expect(isStaleDeployError(new Error('Minified React error #412; visit ...'))).toBe(true);
    });

    it('allows providing custom patterns list and iterating multiple patterns', () => {
        const error1 = new Error('No match here');
        expect(isStaleDeployError(error1, ['foo', 'bar'])).toBe(false);

        const error2 = new Error('Bar match here');
        expect(isStaleDeployError(error2, ['foo', 'bar'])).toBe(true);

        const error3 = new Error('Foo match here');
        expect(isStaleDeployError(error3, ['foo', 'bar'])).toBe(true);
    });

    it('falls back to active patterns when patterns argument is undefined', () => {
        const error = new Error('Failed to fetch resource');
        expect(isStaleDeployError(error, undefined)).toBe(true);
    });

    it('handles error without message property gracefully', () => {
        const error = Object.create(Error.prototype);
        expect(isStaleDeployError(error)).toBe(false);
    });

    it('handles error with empty message', () => {
        const error = new Error('');
        expect(isStaleDeployError(error)).toBe(false);
    });

    it('returns false for unrelated errors', () => {
        expect(isStaleDeployError(new Error('Database query failed'))).toBe(false);
        expect(isStaleDeployError(new Error('User not found'))).toBe(false);
    });
});
