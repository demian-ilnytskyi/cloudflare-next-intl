import { describe, it, expect } from 'vitest';
import resolveOptionalAuthUser from './resolve_optional_auth_user.js';
import useFirebaseAuthUserServer from './use_auth_user_server.js';

describe('auth shims default exports', () => {
    it('passes through default export for resolveOptionalAuthUser', () => {
        expect(typeof resolveOptionalAuthUser).toBe('function');
    });

    it('passes through default export for useFirebaseAuthUserServer', () => {
        expect(typeof useFirebaseAuthUserServer).toBe('function');
    });
});
