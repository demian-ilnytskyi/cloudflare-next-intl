import { bench, describe } from 'vitest';
import { DEFAULT_MESSAGES_EN } from './default_messages.en';
describe('DEFAULT_MESSAGES_EN', () => {
    bench('reads a known key from the message map', () => {
        void DEFAULT_MESSAGES_EN.invalidEmail;
    });
    bench('reads the unknown fallback key', () => {
        void DEFAULT_MESSAGES_EN.unknown;
    });
});
