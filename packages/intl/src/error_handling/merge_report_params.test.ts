import { describe, it, expect } from 'vitest';
import mergeReportParams from './merge_report_params.js';

describe('mergeReportParams', () => {
    it('returns the caller params untouched when there is nothing to add', () => {
        expect(mergeReportParams({ userId: 'u1' }, {})).toEqual({ userId: 'u1' });
        expect(mergeReportParams(undefined, {})).toBeUndefined();
    });

    it('returns the extras alone when the caller passed no params', () => {
        expect(mergeReportParams(undefined, { digest: 'abc' })).toEqual({ digest: 'abc' });
    });

    it('spreads a plain object', () => {
        expect(mergeReportParams({ userId: 'u1' }, { digest: 'abc' })).toEqual({ userId: 'u1', digest: 'abc' });
    });

    it('nests an array rather than spreading it into numeric keys', () => {
        expect(mergeReportParams(['a', 'b'], { digest: 'abc' })).toEqual({ params: ['a', 'b'], digest: 'abc' });
    });

    it('nests a primitive rather than losing it', () => {
        expect(mergeReportParams('why', { digest: 'abc' })).toEqual({ params: 'why', digest: 'abc' });
    });

    it('treats explicit null as a value to nest, not as absent params', () => {
        expect(mergeReportParams(null, { digest: 'abc' })).toEqual({ params: null, digest: 'abc' });
    });

    it('lets the extras win a key collision, so a caller cannot shadow the report metadata', () => {
        expect(mergeReportParams({ digest: 'caller' }, { digest: 'real' })).toEqual({ digest: 'real' });
    });

    it('composes across realms — client metadata then server requestContext', () => {
        const afterClient = mergeReportParams(['a'], { digest: 'abc' });

        expect(mergeReportParams(afterClient, { requestContext: {} }))
            .toEqual({ params: ['a'], digest: 'abc', requestContext: {} });
    });
});
