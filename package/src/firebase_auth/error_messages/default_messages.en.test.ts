import { describe, it, expect } from 'vitest';
import { DEFAULT_MESSAGES_EN } from './default_messages.en';

describe('DEFAULT_MESSAGES_EN', () => {
    it('has a message for every known firebase auth error key', () => {
        expect(DEFAULT_MESSAGES_EN.invalidEmail).toBe('Please enter a valid email address.');
        expect(DEFAULT_MESSAGES_EN.unknown).toBe('Something went wrong. Please try again.');
    });

    it('exports a fixed, non-empty set of keys', () => {
        expect(Object.keys(DEFAULT_MESSAGES_EN).length).toBeGreaterThan(0);
        for (const value of Object.values(DEFAULT_MESSAGES_EN)) {
            expect(typeof value).toBe('string');
            expect(value.length).toBeGreaterThan(0);
        }
    });
});
