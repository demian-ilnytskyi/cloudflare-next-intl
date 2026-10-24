import { bench, describe } from 'vitest';
import cookieKey from './cookie_key.js';

describe('theme: cookieKey lookup', () => {
    bench('cookieKey value access', () => {
        void cookieKey;
    });
});
