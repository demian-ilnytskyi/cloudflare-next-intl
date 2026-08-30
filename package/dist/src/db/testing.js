function rowsResult(rows) {
    return { kind: 'rows', rows };
}
function executeResult(rows) {
    return { kind: 'execute', rows };
}
class ChainableQuery {
    constructor(takeRows) {
        this.takeRows = takeRows;
        this.chainCalls = [];
    }
    record(method, args) {
        this.chainCalls.push({ method, args });
        return this;
    }
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
class FakeDrizzleDb {
    constructor(queue) {
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
    $with(_name) {
        return { as: (builder) => builder };
    }
    with(..._ctes) {
        return { select: (...args) => this.select(...args) };
    }
}
export function makeFakeDb(results) {
    return new FakeDrizzleDb(results);
}
export { rowsResult, executeResult };
