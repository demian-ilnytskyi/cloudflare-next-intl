import { bench, describe } from 'vitest';
import { getCountry, getTimezone } from './geo';

describe('geo benchmarks', () => {
    const headers = new Headers({
        'x-cf-country': 'UA',
        'x-cf-timezone': 'Europe/Kyiv',
    });

    bench('getCountry with Headers', async () => {
        await getCountry(headers);
    });

    bench('getTimezone with Headers', async () => {
        await getTimezone(headers);
    });
});
