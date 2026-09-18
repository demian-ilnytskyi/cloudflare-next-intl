import { describe, expect, it } from 'vitest';
import {
    isModuleInstalled,
    OPTIONAL_FIREBASE_MODULES,
    optionalFirebaseStubCode,
    optionalFirebaseStubId,
    optionalFirebaseStubPlugin,
} from './optional_firebase_stub.js';

type PluginHook = (this: unknown, ...args: unknown[]) => unknown;

const call = (
    plugin: ReturnType<typeof optionalFirebaseStubPlugin>,
    hook: 'config' | 'resolveId' | 'load',
    ...args: unknown[]
) => (plugin[hook] as PluginHook).call({}, ...args);

describe('optionalFirebaseStubPlugin', () => {
    it('leaves installed peers alone', () => {
        const plugin = optionalFirebaseStubPlugin();
        call(plugin, 'config', {});
        expect(call(plugin, 'resolveId', '@firebase/auth')).toBeUndefined();
    });

    it('stubs every missing peer', () => {
        const plugin = optionalFirebaseStubPlugin({ root: '/nonexistent-root-for-test' });
        expect(call(plugin, 'config', {})).toEqual({ optimizeDeps: { exclude: [...OPTIONAL_FIREBASE_MODULES] } });
        for (const id of OPTIONAL_FIREBASE_MODULES) {
            expect(call(plugin, 'resolveId', id)).toBe(optionalFirebaseStubId(id));
        }
        expect(call(plugin, 'resolveId', 'react')).toBeUndefined();
        expect(call(plugin, 'load', optionalFirebaseStubId('@firebase/app-check'))).toContain('throw new Error');
    });

    it('throws only when the stub module is evaluated', async () => {
        const code = optionalFirebaseStubCode('@firebase/app-check');
        await expect(
            import(/* @vite-ignore */ `data:text/javascript,${encodeURIComponent(code)}`),
        ).rejects.toThrow(/@firebase\/app-check/);
    });

    it('detects installed modules', () => {
        expect(isModuleInstalled('vitest', process.cwd())).toBe(true);
        expect(isModuleInstalled('@firebase/definitely-not-real', process.cwd())).toBe(false);
    });
});
