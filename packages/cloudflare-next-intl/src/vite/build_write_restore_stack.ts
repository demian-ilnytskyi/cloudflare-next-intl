import { writeFileSync } from "node:fs";

/**
 * A single, shared, LIFO restore stack for every build-time-injection Vite
 * plugin in this package (`autoDynamicPagesPlugin`, `autoLocaleParamsPlugin`,
 * ...). Each plugin that writes files during a build to drive that one
 * build (never meant to land in the working tree) registers ONE restore
 * step here instead of its own independent `process.once("exit", ...)`
 * handler.
 *
 * Why shared, and why LIFO: these plugins run in sequence within a single
 * `configResolved` pass, each potentially reading a file the PREVIOUS
 * plugin already wrote to (e.g. `autoLocaleParamsPlugin` reads a
 * `loading.tsx` that `autoDynamicPagesPlugin` just gave a fresh `export
 * const dynamic = "force-dynamic"` line) — a plugin captures whatever it
 * reads right before its own write as "the original" to put back later. If
 * every plugin registered its own independent exit handler, they would all
 * fire in REGISTRATION order (first-registered restores first), which
 * restores the SECOND plugin's write on top of the correctly-restored file
 * from the first — undoing the first plugin's restore and leaving its
 * injected line behind. Restoring in the OPPOSITE order (last write undone
 * first) peels each plugin's change off in reverse, so the file always ends
 * up back at its true pre-build state regardless of how many of these
 * plugins touched it or in what order.
 */
const restoreStack: (() => void)[] = [];
let registered = false;

/**
 * Registers one restore step: `originals` maps each file this plugin wrote
 * to the exact bytes it read right before writing. Multiple calls (one per
 * plugin) stack; `runAllRestores` (armed once, lazily, on the first call)
 * runs them last-registered-first.
 */
export function registerBuildWriteRestore(originals: ReadonlyMap<string, string>): void {
    if (originals.size === 0) return;
    restoreStack.push(() => {
        for (const [file, contents] of originals) {
            try {
                writeFileSync(file, contents, "utf8");
            } catch {
                // A build that already deleted/moved the file leaves nothing to restore.
            }
        }
    });
    if (registered) return;
    registered = true;
    armProcessRestoreHandlers();
}

/**
 * Runs every registered restore step, most-recently-registered first, then
 * clears the stack so a later, unrelated exit-triggering event (a second
 * signal after the first restore already ran) doesn't repeat the writes.
 * Idempotent: safe to call more than once (the second call is a no-op, the
 * stack is already empty).
 */
function runAllRestores(): void {
    while (restoreStack.length > 0) {
        const restore = restoreStack.pop()!;
        restore();
    }
}

/**
 * Arms the process-level hooks exactly once, no matter how many plugins
 * call `registerBuildWriteRestore` — `exit` fires after every build stage
 * has read the files (vinext runs several sequential builds in one
 * process, so restoring on a per-build hook like `closeBundle` would hand
 * later stages a file without the export); `SIGINT`/`SIGTERM` re-raise into
 * `exit`; `uncaughtException`/`unhandledRejection` cover a build that
 * crashes before a clean exit, restoring first and then re-throwing so
 * Node's default fatal behavior still applies.
 */
function armProcessRestoreHandlers(): void {
    process.once("exit", runAllRestores);
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
        process.once(signal, () => {
            runAllRestores();
            process.kill(process.pid, signal);
        });
    }
    process.once("uncaughtException", (err) => {
        runAllRestores();
        throw err;
    });
    process.once("unhandledRejection", (reason) => {
        runAllRestores();
        throw reason;
    });
}
