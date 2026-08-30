import type { FallibleConfigValue } from '../types/types.js';
export default function resolveConfigValue<T>(value: FallibleConfigValue<T> | undefined): Promise<T | null | undefined>;
