# `src/config`

Before importing anything from `cloudflare-next-intl` (almost every subpath
transitively imports `intl_config.ts`), you must:

1. Create a config file that default-exports your `RoutingConfig`, built via
   `setIntlConfig` (see `cloudflare-next-intl/setIntlConfig`).
2. Point the `@intl-config` path alias at that file in both `tsconfig.json`
   and `next.config` (see the package README's "Setup" section).

If `@intl-config` isn't set, `intl_config.ts` throws at module-load time —
before any of your own code runs — so this is the first thing to set up in a
new project.

`@locale-file` is the equivalent alias for the messages/locale-strings file
consumed by the server/client translation hooks.
