import { bench, describe } from 'vitest';
import reportError from './report_error';

const noopOnError = () => { /* swallow for bench */ };
const waitUntil = () => { /* fire-and-forget for bench */ };
const fakeGetCloudflareContext = (() => ({ ctx: { waitUntil } })) as never;

describe('reportError', () => {
    bench('default console.error path (no config)', async () => {
        const original = console.error;
        console.error = noopOnError;
        await reportError(undefined, { error: new Error('boom'), classOrMethodName: 'bench' });
        console.error = original;
    });

    bench('custom onError, no getCloudflareContext (awaited inline)', async () => {
        await reportError({ errorHandling: { onError: noopOnError } }, { error: new Error('boom'), classOrMethodName: 'bench' });
    });

    bench('backgrounded via ctx.waitUntil', async () => {
        await reportError(
            { errorHandling: { onError: noopOnError }, generate: { getCloudflareContext: fakeGetCloudflareContext } },
            { error: new Error('boom'), classOrMethodName: 'bench' },
        );
    });

    bench('skipped entirely (enable: false, no formatting cost paid)', async () => {
        await reportError({ errorHandling: { enable: false, onError: noopOnError } }, { error: new Error('boom'), classOrMethodName: 'bench' });
    });

    bench('skipped entirely (consent: false)', async () => {
        await reportError({ errorHandling: { onError: noopOnError } }, { error: new Error('boom'), classOrMethodName: 'bench', consent: false });
    });
});
