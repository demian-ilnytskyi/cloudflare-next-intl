import { describe, it, expect } from 'vitest';
import { extractLowercaseMessage, messageMatchesAnyPattern } from './match_error_message.js';

describe('extractLowercaseMessage', () => {
    it('lowercases an Error instance\'s message', () => {
        expect(extractLowercaseMessage(new Error('Boom Loudly'))).toBe('boom loudly');
    });

    it('lowercases a plain string', () => {
        expect(extractLowercaseMessage('Boom Loudly')).toBe('boom loudly');
    });

    it('is the empty string for an Error with no message, not null', () => {
        expect(extractLowercaseMessage(new Error())).toBe('');
    });

    it('is null for anything that is neither an Error nor a string', () => {
        expect(extractLowercaseMessage(undefined)).toBeNull();
        expect(extractLowercaseMessage(null)).toBeNull();
        expect(extractLowercaseMessage(42)).toBeNull();
        expect(extractLowercaseMessage({ message: 'boom' })).toBeNull();
    });
});

describe('messageMatchesAnyPattern', () => {
    it('matches a substring regardless of the pattern list\'s own case', () => {
        expect(messageMatchesAnyPattern('typeerror: error in input stream', ['Error In Input Stream'])).toBe(true);
    });

    it('matches against an already-lowercased pattern list unchanged', () => {
        expect(messageMatchesAnyPattern('typeerror: error in input stream', ['error in input stream'])).toBe(true);
    });

    it('is false when no pattern matches', () => {
        expect(messageMatchesAnyPattern('something else entirely', ['error in input stream', 'failed to fetch'])).toBe(false);
    });

    it('is false for an empty pattern list', () => {
        expect(messageMatchesAnyPattern('anything', [])).toBe(false);
    });
});
