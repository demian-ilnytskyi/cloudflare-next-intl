import { bench, describe } from 'vitest';
import setCookie from './set_cookie.js';
describe('setCookie', () => {
    bench('writes a cookie with the default maxAge', () => {
        setCookie({ name: 'theme', value: 'dark' });
    });
    bench('writes a cookie with a custom maxAge', () => {
        setCookie({ name: 'theme', value: 'light', maxAge: 60 });
    });
});
