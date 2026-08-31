import { bench, describe } from 'vitest';
import stringifyUnknown from './stringify_unknown.js';

const error = new Error('boom');
const plainObject = { a: 1, b: { c: 2, d: [1, 2, 3] } };
const circular: Record<string, unknown> = {};
circular.self = circular;

describe('stringifyUnknown', () => {
    bench('string passthrough', () => {
        stringifyUnknown('already a string');
    });

    bench('Error instance', () => {
        stringifyUnknown(error);
    });

    bench('function-wrapped lazy error (server, resolved)', () => {
        stringifyUnknown(() => 'lazy boom');
    });

    bench('function-wrapped lazy error (client, not resolved)', () => {
        stringifyUnknown(() => 'lazy boom', true);
    });

    bench('plain object, pretty-printed', () => {
        stringifyUnknown(plainObject);
    });

    bench('plain object, nested (compact)', () => {
        stringifyUnknown(plainObject, false, true);
    });

    bench('circular object (falls back to [Unserializable value])', () => {
        stringifyUnknown(circular, false, true);
    });
});
