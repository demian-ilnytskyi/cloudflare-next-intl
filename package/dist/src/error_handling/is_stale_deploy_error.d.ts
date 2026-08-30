export declare const defaultStaleDeployPatterns: readonly string[];
export declare function setStaleDeployPatterns(patterns: readonly string[]): void;
export declare function getStaleDeployPatterns(): readonly string[];
export default function isStaleDeployError(error: unknown, patterns?: readonly string[]): boolean;
