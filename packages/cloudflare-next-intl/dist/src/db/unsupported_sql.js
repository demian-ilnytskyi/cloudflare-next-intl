export default class UnsupportedSqlError extends Error {
    constructor(construct) {
        super(`db: this query cannot be expressed through the Supabase REST API (${construct}).`);
        this.name = 'UnsupportedSqlError';
        this.construct = construct;
    }
}
