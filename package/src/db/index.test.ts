import { describe, expect, it } from 'vitest';
import * as db from './index.js';

describe('db entry point', () => {
    it('exposes only the wrapper API', () => {
        expect(Object.keys(db).sort()).toEqual([
            'connectToPostgres',
            'disconnectPostgres',
            'resetConnectionState',
            'resolveUserDbCredentials',
            'withDbClient',
            'withPublicDb',
            'withUserDb',
        ]);
    });
});
