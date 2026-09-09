/**
 * Raised by the statement parser and REST executor when a generated
 * statement uses something PostgREST's single-table API cannot express.
 *
 * The transport catches this specific type to decide between falling back to
 * `cfni_exec` and reporting the limitation to the caller, so it must stay
 * distinguishable from a genuine query failure.
 */
export default class UnsupportedSqlError extends Error {
    /** Short name of the construct that could not be translated. */
    readonly construct: string;

    /**
     * @param construct Short name of the unsupported construct, e.g. `'join'`.
     */
    constructor(construct: string) {
        super(`db: this query cannot be expressed through the Supabase REST API (${construct}).`);
        this.name = 'UnsupportedSqlError';
        this.construct = construct;
    }
}
