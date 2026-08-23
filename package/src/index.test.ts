import { describe, it, expect } from 'vitest';
import * as root from './index';

describe('package root barrel', () => {
    it('does not re-export the db module', () => {
        // `db` connects to `pg`/`drizzle-orm`/`@supabase/supabase-js` — none of
        // that is browser-safe. Every other optional submodule (firebase_auth,
        // cookie_consent, error_handling) is reachable ONLY via its dedicated
        // subpath (e.g. `cloudflare-next-intl/getFirebaseAuthUser`), never the
        // root barrel, specifically so a client component importing anything
        // from the package root — `import { Link } from "cloudflare-next-intl"`
        // — never pulls Node-only db internals into its bundle graph. `db` must
        // follow the same rule: reachable only via `cloudflare-next-intl/db`.
        expect((root as Record<string, unknown>).withPublicDb).toBeUndefined();
        expect((root as Record<string, unknown>).withUserDb).toBeUndefined();
        expect((root as Record<string, unknown>).connectToPostgres).toBeUndefined();
        expect((root as Record<string, unknown>).disconnectPostgres).toBeUndefined();
        expect((root as Record<string, unknown>).resetConnectionState).toBeUndefined();
    });

    it('still re-exports non-db submodules at root', () => {
        // Confirms the import above actually resolved the real barrel rather
        // than silently no-op'ing (e.g. from a typo'd path).
        expect(root.setLocale).toBeDefined();
    });
});
