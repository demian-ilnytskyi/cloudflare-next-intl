import { bench, describe } from 'vitest';
import getCookie from './get_cookie.js';

describe('getCookie', () => {
    document.cookie = 'bench-cookie=bar%20baz';

    bench('reads and decodes an existing cookie', () => {
        getCookie('bench-cookie');
    });

    bench('returns null for a missing cookie', () => {
        getCookie('missing-cookie');
    });
});
