import type { FallibleConfigValue } from '../types/types';

/**
 * Resolves a config value that may have been supplied directly or as a
 * sync/async function. A resolver may return `null` to mean "nothing here —
 * fall through to whatever the caller checks next" — callers already treat
 * that the same as `undefined` wherever they use `??`/truthiness on the
 * result, so this passes it through rather than coercing it away.
 *
 * @param value The configured value or resolver.
 * @returns The resolved value, or `null`/`undefined` when nothing was configured.
 */
export default async function resolveConfigValue<T>(
    value: FallibleConfigValue<T> | undefined,
): Promise<T | null | undefined> {
    return typeof value === 'function' ? (value as () => T | Promise<T>)() : value;
}
