import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import cloudflareCachePurger from "@opennextjs/cloudflare/overrides/cache-purge/index";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";

export default defineCloudflareConfig({
  incrementalCache: r2IncrementalCache,
  enableCacheInterception: true,
  routePreloadingBehavior: "none",
  cachePurge: cloudflareCachePurger({ type: 'durableObject' }),
  queue: doQueue
});
