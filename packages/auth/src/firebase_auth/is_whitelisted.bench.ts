import { bench, describe } from 'vitest';
import isWhitelisted from './is_whitelisted.js';

const shortList = ['/bonds', '/inflation', '/articles'];
const longList = Array.from({ length: 30 }, (_, i) => `/section-${i}`);

describe('isWhitelisted: short list (3 entries)', () => {
    bench('exact match (first entry)', () => {
        isWhitelisted('/bonds', shortList);
    });
    bench('prefix match (last entry)', () => {
        isWhitelisted('/articles/some-slug', shortList);
    });
    bench('no match (scans every entry)', () => {
        isWhitelisted('/dashboard', shortList);
    });
});

describe('isWhitelisted: long list (30 entries)', () => {
    bench('no match (scans every entry)', () => {
        isWhitelisted('/dashboard', longList);
    });
    bench('prefix match (last entry)', () => {
        isWhitelisted('/section-29/nested', longList);
    });
});
