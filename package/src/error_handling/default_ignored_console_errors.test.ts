import { describe, it, expect } from 'vitest';
import { defaultIgnoredConsoleErrors } from './default_ignored_console_errors';

describe('defaultIgnoredConsoleErrors', () => {
    it('includes the Firebase Auth error codes this package translates in auth_actions.ts', () => {
        expect(defaultIgnoredConsoleErrors).toContain('auth/wrong-password');
        expect(defaultIgnoredConsoleErrors).toContain('auth/email-already-in-use');
        expect(defaultIgnoredConsoleErrors).toContain('auth/weak-password');
        expect(defaultIgnoredConsoleErrors).toContain('auth/too-many-requests');
    });

    it('does not include the generic unknown-error fallback', () => {
        expect(defaultIgnoredConsoleErrors).not.toContain('unknown');
    });
});
