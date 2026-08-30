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
    it('depends on the scoped @firebase entry points, not the firebase umbrella', () => {
        const pkg = JSON.parse(
            readFileSync(resolve(here, '../../package.json'), 'utf8'),
        ) as { dependencies?: Record<string, string> };
        const deps = pkg.dependencies ?? {};
        expect(deps['firebase']).toBeUndefined();
        expect(deps['@firebase/app']).toBeDefined();
        expect(deps['@firebase/auth']).toBeDefined();
        expect(deps['@firebase/app-check']).toBeDefined();
        expect(deps['@firebase/performance']).toBeDefined();
    });

    it('imports no bare "firebase/*" specifier anywhere in src', () => {
        const offenders = walk(resolve(here, '..')).filter((file) =>
            /['"]firebase\/[a-z-]+['"]/.test(readFileSync(file, 'utf8')),
        );
        expect(offenders).toEqual([]);
    });
});
