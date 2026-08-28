import { describe, it, expect, vi } from 'vitest';
import { defaultIgnoredConsoleErrors } from './default_ignored_console_errors';

describe('defaultIgnoredConsoleErrors', () => {
    it('includes the Firebase Auth error codes this package translates in auth_actions.ts', () => {
        expect(defaultIgnoredConsoleErrors).toContain('auth/wrong-password');
        expect(defaultIgnoredConsoleErrors).toContain('auth/email-already-in-use');
        expect(defaultIgnoredConsoleErrors).toContain('auth/weak-password');
        expect(defaultIgnoredConsoleErrors).toContain('auth/too-many-requests');
    });

    it('includes the revoked-session-token noise initializeServerApp logs itself', () => {
        expect(defaultIgnoredConsoleErrors).toContain('auth/invalid-user-token');
        expect(defaultIgnoredConsoleErrors).toContain('FirebaseServerApp could not login user with provided authIdToken');
        expect(defaultIgnoredConsoleErrors).toContain('FirebaseServerApp appCheckToken is invalid: the token has expired.');
    });

    it('does not include the generic unknown-error fallback', () => {
        expect(defaultIgnoredConsoleErrors).not.toContain('unknown');
    });

    it('includes DurableObject development warning when NODE_ENV is development', async () => {
        const originalEnv = process.env.NODE_ENV;
        try {
            process.env.NODE_ENV = 'development';
            vi.resetModules();
            const { defaultIgnoredConsoleErrors: devErrors } = await import('./default_ignored_console_errors');
            expect(devErrors).toContain(
                'A DurableObjectNamespace in the config referenced the class "DOQueueHandler", but no such Durable Object class is exported from the worker. Please make sure the class name matches,',
            );
        } finally {
            process.env.NODE_ENV = originalEnv;
            vi.resetModules();
        }
    });
});
