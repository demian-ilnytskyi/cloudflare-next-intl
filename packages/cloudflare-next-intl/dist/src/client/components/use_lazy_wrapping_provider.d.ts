import { type ComponentType } from "react";
type ModuleLoader<P> = () => Promise<{
    default: ComponentType<P>;
}>;
export interface LazyWrappingProviderResult<P extends Record<string, unknown>> {
    Provider: ComponentType<P & {
        children?: React.ReactNode;
    }>;
    isReady: boolean;
}
export default function useLazyWrappingProvider<P extends Record<string, unknown>>(loader: ModuleLoader<P>): LazyWrappingProviderResult<P>;
export {};
