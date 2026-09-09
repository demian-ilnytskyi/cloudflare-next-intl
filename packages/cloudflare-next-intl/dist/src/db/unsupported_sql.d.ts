export default class UnsupportedSqlError extends Error {
    readonly construct: string;
    constructor(construct: string);
}
