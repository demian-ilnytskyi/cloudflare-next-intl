import type { ErrorHandlingParams } from '../types/types.js';
export default function reportClientError(error: unknown, classOrMethodName: string, params?: ErrorHandlingParams['params']): Promise<void>;
