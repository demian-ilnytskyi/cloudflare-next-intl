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
type Row = Record<string, unknown>;
interface QueuedResult {
    kind: 'rows' | 'execute';
    rows: Row[];
}
/** Queues a result for a `select`/`insert`/`update`/`delete` chain. */
declare function rowsResult(rows: Row[]): QueuedResult;
/** Queues a result for an `execute(...)` call. */
declare function executeResult(rows: Row[]): QueuedResult;
interface ChainCall {
    method: string;
    args: unknown[];
}
/**
 * Lazy like real drizzle query builders: intermediate calls just record
 * themselves and return `this`; the queue is only consumed when the chain
 * is actually awaited (`.then()`), which is also when a CTE built via
 * `db.$with(name).as(builder)` is skipped — a CTE definition is never
 * itself awaited standalone, only the final `db.with(...).select(...)`
 * chain that references it is.
 */
declare class ChainableQuery implements PromiseLike<Row[]> {
    private readonly takeRows;
    /** Every intermediate call this chain received, in call order, with its exact arguments. */
    readonly chainCalls: ChainCall[];
    constructor(takeRows: () => Row[]);
    private record;
    /** Returns the arguments of this chain's first call to `method` (e.g. `"where"`, `"values"`). */
    argsOf(method: string): unknown[] | undefined;
    from(...args: unknown[]): this;
    leftJoin(...args: unknown[]): this;
    innerJoin(...args: unknown[]): this;
    where(...args: unknown[]): this;
    orderBy(...args: unknown[]): this;
    groupBy(...args: unknown[]): this;
    limit(...args: unknown[]): this;
    offset(...args: unknown[]): this;
    values(...args: unknown[]): this;
    set(...args: unknown[]): this;
    returning(...args: unknown[]): this;
    as(...args: unknown[]): this;
    then<TResult1 = Row[], TResult2 = never>(onfulfilled?: ((value: Row[]) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null): Promise<TResult1 | TResult2>;
}
/**
 * Fake {@link DrizzleDb} backed by a queue of canned results. Build one with
 * {@link makeFakeDb} rather than calling this constructor directly.
 */
declare class FakeDrizzleDb {
    private readonly queue;
    /** Top-level calls captured for assertions — each entry's `chain` is the same `ChainableQuery` returned to the caller, so its recorded `.where()`/`.values()`/etc. arguments are inspectable via `chain.argsOf(...)`. */
    readonly calls: {
        method: string;
        args: unknown[];
        chain: ChainableQuery;
    }[];
    constructor(queue: QueuedResult[]);
    private takeRows;
    private makeChain;
    select(...args: unknown[]): ChainableQuery;
    insert(...args: unknown[]): ChainableQuery;
    update(...args: unknown[]): ChainableQuery;
    delete(...args: unknown[]): ChainableQuery;
    execute(...args: unknown[]): Promise<{
        rows: Row[];
    }>;
    /** CTE definition — never awaited on its own, so it must not touch the queue. */
    $with(_name: string): {
        as: (builder: unknown) => unknown;
    };
    with(..._ctes: unknown[]): {
        select: (...args: unknown[]) => ChainableQuery;
    };
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
export declare function makeFakeDb(results: QueuedResult[]): FakeDrizzleDb;
export { rowsResult, executeResult };
export type { Row, ChainableQuery, FakeDrizzleDb };
