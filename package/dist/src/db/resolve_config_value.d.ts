import type { ConfigValue } from '../types/types';
/**
 * Resolves a config value that may have been supplied directly or as a
 * sync/async function.
 *
 * @param value The configured value or resolver.
 * @returns The resolved value, or `undefined` when nothing was configured.
 */
export default function resolveConfigValue<T>(value: ConfigValue<T | undefined> | undefined): Promise<T | undefined>;
