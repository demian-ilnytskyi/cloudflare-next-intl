export declare const defaultStaleDeployPatterns: readonly string[];
export declare function setStaleDeployPatterns(patterns: readonly string[]): void;
export declare function getStaleDeployPatterns(): readonly string[];
export default function isStaleDeployError(error: Error, patterns?: readonly string[]): boolean;
