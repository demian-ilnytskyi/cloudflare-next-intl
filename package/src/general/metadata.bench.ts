import { bench, describe } from 'vitest';
import { alternatesLinks, languages } from './metadata';

describe('languages', () => {
    bench('builds per-locale hreflang map for one URL', () => {
        languages(`https://example.com/${Math.random()}`, '/about');
    });
});

describe('alternatesLinks', () => {
    bench('builds canonical + languages for the default locale', () => {
        alternatesLinks({ url: `https://example.com/${Math.random()}`, locale: 'en', linkPart: '/about' });
    });

    bench('builds languages only for a non-default locale (no canonical)', () => {
        alternatesLinks({ url: `https://example.com/${Math.random()}`, locale: 'de', linkPart: '/about' });
    });
});
