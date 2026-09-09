/**
 * Memoizes an async function keyed on the identity of its first argument —
 * a `WeakMap`-based stand-in for React's `cache()`, usable outside a React
 * render. Every caller in this package passes a stable `db`/`generate`
 * config object as that first argument, so this buys the same "resolved
 * once per config object" behaviour `cache()` gave the Next.js-only version
 * of this code, without depending on `react` at all.
 *
 * A rejected call is never cached — the next call with the same key retries
 * `fn` from scratch, matching `cache()`'s own behaviour (it does not cache
 * thrown/rejected results either).
 */
export default function memoizeByRef<Args extends [object, ...unknown[]], R>(
    fn: (...args: Args) => Promise<R>,
): (...args: Args) => Promise<R> {
    const cache = new WeakMap<object, Promise<R>>();

    return (...args: Args): Promise<R> => {
        const key = args[0];
        const cached = cache.get(key);
        if (cached) return cached;

        const result = fn(...args);
        cache.set(key, result);
        result.catch(() => cache.delete(key));
        return result;
    };
}
