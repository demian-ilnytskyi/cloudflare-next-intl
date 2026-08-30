import { describe, it, expect } from 'vitest';
import requireFirebaseAuthConfig from './require_config.js';
import type { FirebaseAuthRoutingConfig } from '../types/types.js';

describe('requireFirebaseAuthConfig', () => {
    it('throws when firebaseAuth config is undefined', () => {
        expect(() => requireFirebaseAuthConfig(undefined)).toThrow(
            /firebaseAuth.*is not set/,
        );
    });

    it('does not throw when firebaseAuth config is provided', () => {
        const fa: FirebaseAuthRoutingConfig = {
            apiKey: 'key',
            authDomain: 'domain',
            projectId: 'proj',
            appId: 'app',
            redirectAuthPath: '/login',
            homePath: '/',
            isAuthPath: () => false,
        };
        expect(() => requireFirebaseAuthConfig(fa)).not.toThrow();
    });
});
