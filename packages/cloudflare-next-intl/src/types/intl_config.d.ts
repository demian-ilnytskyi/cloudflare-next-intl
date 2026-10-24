declare module "@intl-config" {
    import type { RoutingConfig, Locales, LocalePrefixMode } from "./types.js";
    const config: RoutingConfig<Locales, LocalePrefixMode>;
    export default config;
}
