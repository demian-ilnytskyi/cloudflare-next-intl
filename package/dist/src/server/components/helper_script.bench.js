import { bench, describe } from 'vitest';
import { isDarkCookieKey } from '../../config/cookie_key.js';
const getCookieRegex = (name) => {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
};
const cache = new Map();
const getCookieCachedRegex = (name) => {
    let re = cache.get(name);
    if (!re) {
        re = new RegExp(`(?:^|; )${name}=([^;]*)`);
        cache.set(name, re);
    }
    const match = document.cookie.match(re);
    return match ? decodeURIComponent(match[1]) : null;
};
const getCookieIndexOf = (name) => {
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
document.cookie = `${isDarkCookieKey}=true`;
document.cookie = 'NEXT_LOCALE=uk';
document.cookie = 'session=abcdefghijklmnop';
describe('cookie read strategies', () => {
    bench('regex constructed per call (current)', () => {
        getCookieRegex(isDarkCookieKey);
    });
    bench('regex cached', () => {
        getCookieCachedRegex(isDarkCookieKey);
    });
    bench('indexOf scan, no decode', () => {
        getCookieIndexOf(isDarkCookieKey);
    });
});
describe('theme apply', () => {
    bench('guarded toggle (current)', () => {
        const classList = document.documentElement.classList;
        const isDark = true;
        if (classList.contains('dark') !== isDark) {
            classList.toggle('dark', isDark);
        }
    });
    bench('unguarded toggle', () => {
        document.documentElement.classList.toggle('dark', true);
    });
});
describe('full inline script path', () => {
    bench('current: read cookie + guarded toggle', () => {
        const isDark = getCookieRegex(isDarkCookieKey);
        const classList = document.documentElement.classList;
        const want = isDark === 'true';
        if (classList.contains('dark') !== want) {
            classList.toggle('dark', want);
        }
    });
    bench('optimized: indexOf + guarded toggle', () => {
        const isDark = getCookieIndexOf(isDarkCookieKey);
        const classList = document.documentElement.classList;
        const want = isDark === 'true';
        if (classList.contains('dark') !== want) {
            classList.toggle('dark', want);
        }
    });
});
