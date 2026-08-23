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
function rowsResult(rows: Row[]): QueuedResult {
    return { kind: 'rows', rows };
}

/** Queues a result for an `execute(...)` call. */
function executeResult(rows: Row[]): QueuedResult {
    return { kind: 'execute', rows };
}

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
class ChainableQuery implements PromiseLike<Row[]> {
    /** Every intermediate call this chain received, in call order, with its exact arguments. */
    public readonly chainCalls: ChainCall[] = [];

    constructor(private readonly takeRows: () => Row[]) {}

    private record(method: string, args: unknown[]): this {
        this.chainCalls.push({ method, args });
        return this;
    }

    /** Returns the arguments of this chain's first call to `method` (e.g. `"where"`, `"values"`). */
    argsOf(method: string): unknown[] | undefined {
        return this.chainCalls.find((c) => c.method === method)?.args;
    }

    from(...args: unknown[]): this { return this.record('from', args); }
    leftJoin(...args: unknown[]): this { return this.record('leftJoin', args); }
    innerJoin(...args: unknown[]): this { return this.record('innerJoin', args); }
    where(...args: unknown[]): this { return this.record('where', args); }
    orderBy(...args: unknown[]): this { return this.record('orderBy', args); }
    groupBy(...args: unknown[]): this { return this.record('groupBy', args); }
    limit(...args: unknown[]): this { return this.record('limit', args); }
    offset(...args: unknown[]): this { return this.record('offset', args); }
    values(...args: unknown[]): this { return this.record('values', args); }
    set(...args: unknown[]): this { return this.record('set', args); }
    returning(...args: unknown[]): this { return this.record('returning', args); }
    as(...args: unknown[]): this { return this.record('as', args); }

    then<TResult1 = Row[], TResult2 = never>(
        onfulfilled?: ((value: Row[]) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
        return Promise.resolve().then(() => this.takeRows()).then(onfulfilled, onrejected);
    }
}

/**
 * Fake {@link DrizzleDb} backed by a queue of canned results. Build one with
 * {@link makeFakeDb} rather than calling this constructor directly.
 */
class FakeDrizzleDb {
    private readonly queue: QueuedResult[];
    /** Top-level calls captured for assertions — each entry's `chain` is the same `ChainableQuery` returned to the caller, so its recorded `.where()`/`.values()`/etc. arguments are inspectable via `chain.argsOf(...)`. */
    public readonly calls: { method: string; args: unknown[]; chain: ChainableQuery }[] = [];

    constructor(queue: QueuedResult[]) {
        this.queue = [...queue];
    }

    private takeRows(method: string): Row[] {
        const next = this.queue.shift();
        if (!next) throw new Error(`FakeDrizzleDb: no queued result left for ${method}()`);
        return next.rows;
    }

    private makeChain(method: string, args: unknown[]): ChainableQuery {
        const chain = new ChainableQuery(() => this.takeRows(method));
        this.calls.push({ method, args, chain });
        return chain;
    }

    select(...args: unknown[]): ChainableQuery {
        return this.makeChain('select', args);
    }

    insert(...args: unknown[]): ChainableQuery {
        return this.makeChain('insert', args);
    }

    update(...args: unknown[]): ChainableQuery {
        return this.makeChain('update', args);
    }

    delete(...args: unknown[]): ChainableQuery {
        return this.makeChain('delete', args);
    }

    async execute(...args: unknown[]): Promise<{ rows: Row[] }> {
        this.calls.push({ method: 'execute', args, chain: new ChainableQuery(() => []) });
        const next = this.queue.shift();
        if (!next) throw new Error('FakeDrizzleDb: no queued result left for execute()');
        return { rows: next.rows };
    }

    /** CTE definition — never awaited on its own, so it must not touch the queue. */
    $with(_name: string): { as: (builder: unknown) => unknown } {
        return { as: (builder: unknown) => builder };
    }

    with(..._ctes: unknown[]): { select: (...args: unknown[]) => ChainableQuery } {
        return { select: (...args: unknown[]) => this.select(...args) };
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
export function makeFakeDb(results: QueuedResult[]): FakeDrizzleDb {
    return new FakeDrizzleDb(results);
}

export { rowsResult, executeResult };
export type { Row, ChainableQuery, FakeDrizzleDb };
