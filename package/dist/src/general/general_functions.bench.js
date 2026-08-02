import { bench, describe } from 'vitest';
import { getTranslationsImpl } from './general_functions';
const shallowMessages = { common: { hello: 'Hello' } };
const deepMessages = { a: { b: { c: { d: { e: { hello: 'Deeply nested hello' } } } } } };
describe('getTranslationsImpl', () => {
    bench('shallow namespace, cold (new cacheKey each call)', () => {
        getTranslationsImpl('en', shallowMessages, 'common', `cold-${Math.random()}`);
    });
    bench('shallow namespace, warm (same cacheKey, cache hit)', () => {
        getTranslationsImpl('en', shallowMessages, 'common', 'warm-shallow');
    });
    bench('deep namespace (5 levels), cold', () => {
        getTranslationsImpl('en', deepMessages, 'a.b.c.d.e', `cold-deep-${Math.random()}`);
    });
    bench('deep namespace (5 levels), warm', () => {
        getTranslationsImpl('en', deepMessages, 'a.b.c.d.e', 'warm-deep');
    });
});
