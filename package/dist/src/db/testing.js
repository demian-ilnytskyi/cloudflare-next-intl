/**
 * Test double for {@link DrizzleDb} — the handle `withPublicDb`/`withUserDb`
 * pass to your callback. Use it in repository/unit tests to avoid a real
 * Postgres connection: build one with {@link makeFakeDb}, queue canned
 * results with {@link rowsResult}/{@link executeResult}, then pass it
 * directly wherever your code expects a `DrizzleDb`.
 *
 * Real repositories call chains like `db.select({...}).from(t).where(w)...`
 * where every intermediate call returns `this` and the final awaited value
 * resolves to a canned row array — plus `db.execute(sql...)` resolving to
 * `{ rows: [...] }`, and `db.$with(name).as(builder)` / `db.with(...).select(...)`
 * for CTE-based queries.
 *
 * Each fake db instance is given an ordered queue of results (`resultQueue`)
 * consumed one-per-terminal-call in the exact sequence your code issues
 * them — select/insert/update/delete/execute all share one queue, so call
 * order in your source is what determines which fixture a call gets.
 *
 * Every intermediate chain call (`.where(...)`, `.values(...)`, `.set(...)`,
 * `.orderBy(...)`, etc.) is also recorded with its exact arguments on the
 * chain object returned from `select`/`insert`/`update`/`delete`, and that
 * chain object is attached to the matching entry in `db.calls` — so a test
 * can assert not just "select was called twice" but "the second select's
 * `.where(...)` argument was X", closing the gap where a fake that only
 * echoes canned rows back can't detect a broken predicate/sort/value.
 */
/** Queues a result for a `select`/`insert`/`update`/`delete` chain. */
function rowsResult(rows) {
    return { kind: 'rows', rows };
}
/** Queues a result for an `execute(...)` call. */
function executeResult(rows) {
    return { kind: 'execute', rows };
}
/**
 * Lazy like real drizzle query builders: intermediate calls just record
 * themselves and return `this`; the queue is only consumed when the chain
 * is actually awaited (`.then()`), which is also when a CTE built via
 * `db.$with(name).as(builder)` is skipped — a CTE definition is never
 * itself awaited standalone, only the final `db.with(...).select(...)`
 * chain that references it is.
 */
class ChainableQuery {
    constructor(takeRows) {
        this.takeRows = takeRows;
        /** Every intermediate call this chain received, in call order, with its exact arguments. */
        this.chainCalls = [];
    }
    record(method, args) {
        this.chainCalls.push({ method, args });
        return this;
    }
    /** Returns the arguments of this chain's first call to `method` (e.g. `"where"`, `"values"`). */
    argsOf(method) {
        return this.chainCalls.find((c) => c.method === method)?.args;
    }
    from(...args) { return this.record('from', args); }
    leftJoin(...args) { return this.record('leftJoin', args); }
    innerJoin(...args) { return this.record('innerJoin', args); }
    where(...args) { return this.record('where', args); }
    orderBy(...args) { return this.record('orderBy', args); }
    groupBy(...args) { return this.record('groupBy', args); }
    limit(...args) { return this.record('limit', args); }
    offset(...args) { return this.record('offset', args); }
    values(...args) { return this.record('values', args); }
    set(...args) { return this.record('set', args); }
    returning(...args) { return this.record('returning', args); }
    as(...args) { return this.record('as', args); }
    then(onfulfilled, onrejected) {
        return Promise.resolve().then(() => this.takeRows()).then(onfulfilled, onrejected);
    }
}
/**
 * Fake {@link DrizzleDb} backed by a queue of canned results. Build one with
 * {@link makeFakeDb} rather than calling this constructor directly.
 */
class FakeDrizzleDb {
    constructor(queue) {
        /** Top-level calls captured for assertions — each entry's `chain` is the same `ChainableQuery` returned to the caller, so its recorded `.where()`/`.values()`/etc. arguments are inspectable via `chain.argsOf(...)`. */
        this.calls = [];
        this.queue = [...queue];
    }
    takeRows(method) {
        const next = this.queue.shift();
        if (!next)
            throw new Error(`FakeDrizzleDb: no queued result left for ${method}()`);
        return next.rows;
    }
    makeChain(method, args) {
        const chain = new ChainableQuery(() => this.takeRows(method));
        this.calls.push({ method, args, chain });
        return chain;
    }
    select(...args) {
        return this.makeChain('select', args);
    }
    insert(...args) {
        return this.makeChain('insert', args);
    }
    update(...args) {
        return this.makeChain('update', args);
    }
    delete(...args) {
        return this.makeChain('delete', args);
    }
    async execute(...args) {
        this.calls.push({ method: 'execute', args });
        const next = this.queue.shift();
        if (!next)
            throw new Error('FakeDrizzleDb: no queued result left for execute()');
        return { rows: next.rows };
    }
    /** CTE definition — never awaited on its own, so it must not touch the queue. */
    $with(_name) {
        return { as: (builder) => builder };
    }
    with(..._ctes) {
        return { select: (...args) => this.select(...args) };
    }
}
/**
 * Builds a fake {@link DrizzleDb} that resolves each terminal call
 * (`select`/`insert`/`update`/`delete`/`execute`) to the next entry in
 * `results`, in the exact order your code under test calls them.
 *
 * @param results Queued results, one per terminal call, built with
 * {@link rowsResult}/{@link executeResult}.
 * @returns A fake db to pass wherever your code expects a `DrizzleDb`.
 *
 * @example
 * const db = makeFakeDb([rowsResult([{ id: 1 }])]);
 * const rows = await db.select().from(bonds);
 */
export function makeFakeDb(results) {
    return new FakeDrizzleDb(results);
}
export { rowsResult, executeResult };
