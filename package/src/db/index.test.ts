import { describe, expect, it } from 'vitest';
import * as db from './index';

describe('db entry point', () => {
    it('exposes only the wrapper API', () => {
        expect(Object.keys(db).sort()).toEqual([
            'connectToPostgres',
            'disconnectPostgres',
            'resetConnectionState',
            'withPublicDb',
            'withPublicTransaction',
            'withUserDb',
            'withUserTransaction',
        ]);
    });
});
