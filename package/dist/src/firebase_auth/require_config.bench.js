import { bench, describe } from 'vitest';
import requireFirebaseAuthConfig from './require_config';
const fa = {
    apiKey: 'key',
    authDomain: 'domain',
    projectId: 'proj',
    appId: 'app',
    redirectAuthPath: '/login',
    homePath: '/',
    isAuthPath: () => false,
};
describe('requireFirebaseAuthConfig', () => {
    bench('valid config: passes the assertion', () => {
        requireFirebaseAuthConfig(fa);
    });
    bench('missing config: throws', () => {
        try {
            requireFirebaseAuthConfig(undefined);
        }
        catch {
            // expected
        }
    });
});
