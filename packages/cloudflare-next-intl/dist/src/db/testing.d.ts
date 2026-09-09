type Row = Record<string, unknown>;
interface QueuedResult {
    kind: 'rows' | 'execute';
    rows: Row[];
}
declare function rowsResult(rows: Row[]): QueuedResult;
declare function executeResult(rows: Row[]): QueuedResult;
interface ChainCall {
    method: string;
    args: unknown[];
}
declare class ChainableQuery implements PromiseLike<Row[]> {
    private readonly takeRows;
    readonly chainCalls: ChainCall[];
    constructor(takeRows: () => Row[]);
    private record;
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
declare class FakeDrizzleDb {
    private readonly queue;
    readonly calls: {
        method: string;
        args: unknown[];
        chain?: ChainableQuery;
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
    $with(_name: string): {
        as: (builder: unknown) => unknown;
    };
    with(..._ctes: unknown[]): {
        select: (...args: unknown[]) => ChainableQuery;
    };
}
export declare function makeFakeDb(results: QueuedResult[]): FakeDrizzleDb;
export { rowsResult, executeResult };
export type { Row, ChainableQuery, FakeDrizzleDb };
