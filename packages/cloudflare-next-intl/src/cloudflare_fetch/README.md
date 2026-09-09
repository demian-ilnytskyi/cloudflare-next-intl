# `src/cloudflare_fetch`

Fetches a URL via the Cloudflare Assets Service binding (`env.ASSETS`) when
one is configured, falling back to the global `fetch` (with
`cache: 'no-store'`) otherwise — the same shape as hand-rolling
"if dev, plain fetch; if deployed, the binding" yourself, except the
binding is resolved through this package's own `generate.env`/
`generate.getCloudflareContext` convention (`src/server/functions/geo.ts`'s
`resolveEnv`), so it works whether your app runs on Next+OpenNext, Vinext,
or a plain Cloudflare Worker — not just Next.

## Usage

```ts
import { fetchText } from 'cloudflare-next-intl/fetchText';
import intlConfig from './intl_config';

const body = await fetchText(
    'https://internal.example.com/data.json',
    { headers: { Authorization: `Bearer ${token}` } },
    { generate: intlConfig.generate, errorHandling: intlConfig.errorHandling },
    'MyFeature.fetchThing',
);
if (body === null) {
    // fetch failed or returned non-ok; already reported via errorHandling.onError
}
```

Use `fetchWithCloudflareFallback` directly instead of `fetchText` when you
need the raw `Response` (e.g. non-text bodies, or you want to handle
errors yourself rather than getting `null` + an automatic report).

## Layout

- `resolve_assets_binding.ts` — resolves `env.ASSETS` via `resolveEnv()` and
  checks it's actually callable; `null` when unavailable (the normal case
  in local dev).
- `fetch_with_fallback.ts` — the binding-or-`fetch` primitive; returns a
  raw `Response`.
- `fetch_text.ts` — `fetchWithCloudflareFallback` + `reportError` +
  "return `null` on any failure", full parity with the
  `site_fetch_repository.ts` pattern this module replaces.
