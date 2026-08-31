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

import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = resolve(fileURLToPath(import.meta.url), '..');

function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory()
            ? walk(resolve(dir, e.name))
            : /\.tsx?$/.test(e.name)
              ? [resolve(dir, e.name)]
              : [],
    );
}

describe('firebase_auth dependency surface', () => {
    // @firebase/* must stay peerDependencies, not dependencies — a bundled copy
    // would resolve independently of the consumer's own `firebase` install and
    // silently create a second, untracked Firebase app (see the doc comment on
    // getFirebaseAuthClient in client/firebase_client.ts for why). If this test
    // is failing because you added @firebase/* back to `dependencies`, that's
    // very likely a regression, not a fix — see CHANGELOG.md 0.9.0.
    it('peers on the scoped @firebase entry points, not the firebase umbrella, so consumers share a single instance', () => {
        const pkg = JSON.parse(
            readFileSync(resolve(here, '../../package.json'), 'utf8'),
        ) as { dependencies?: Record<string, string>; peerDependencies?: Record<string, string> };
        const deps = pkg.dependencies ?? {};
        const peers = pkg.peerDependencies ?? {};
        expect(deps['firebase']).toBeUndefined();
        expect(peers['firebase']).toBeUndefined();
        expect(deps['@firebase/app']).toBeUndefined();
        expect(deps['@firebase/auth']).toBeUndefined();
        expect(deps['@firebase/app-check']).toBeUndefined();
        expect(deps['@firebase/performance']).toBeUndefined();
        expect(peers['@firebase/app']).toBeDefined();
        expect(peers['@firebase/auth']).toBeDefined();
        expect(peers['@firebase/app-check']).toBeDefined();
        expect(peers['@firebase/performance']).toBeDefined();
    });

    it('imports no bare "firebase/*" specifier anywhere in src', () => {
        const offenders = walk(resolve(here, '..')).filter((file) =>
            /['"]firebase\/[a-z-]+['"]/.test(readFileSync(file, 'utf8')),
        );
        expect(offenders).toEqual([]);
    });
});
