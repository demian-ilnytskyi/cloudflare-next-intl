import { bench, describe } from 'vitest';
import { localeCookieName } from '../../config/cookie_key.js';

const getCookieRegex = (name: string): string | null => {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
};

const cache = new Map<string, RegExp>();
const getCookieCachedRegex = (name: string): string | null => {
    let re = cache.get(name);
    if (!re) {
        re = new RegExp(`(?:^|; )${name}=([^;]*)`);
        cache.set(name, re);
    }
    const match = document.cookie.match(re);
    return match ? decodeURIComponent(match[1]) : null;
};

const getCookieIndexOf = (name: string): string | null => {
    const raw = document.cookie;
    const key = name + '=';
    let i = raw.indexOf(key);
    while (i !== -1) {
        if (i === 0 || (raw[i - 1] === ' ' && raw[i - 2] === ';')) {
            const end = raw.indexOf(';', i);
            return raw.slice(i + key.length, end === -1 ? undefined : end);
        }
        i = raw.indexOf(key, i + 1);
    }
    return null;
};

document.cookie = `${localeCookieName}=uk`;
document.cookie = 'session=abcdefghijklmnop';

describe('cookie read strategies', () => {
    bench('regex constructed per call (current)', () => {
        getCookieRegex(localeCookieName);
    });

    bench('regex cached', () => {
        getCookieCachedRegex(localeCookieName);
    });

    bench('indexOf scan, no decode', () => {
        getCookieIndexOf(localeCookieName);
    });
});
