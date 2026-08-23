export type RawSqlResolution = {
    status: 'true' | 'false';
    reason: string;
} | {
    status: 'unknown';
    reason: string;
};
/**
 * Locates the project's intl config file (via the `@intl-config` alias
 * declared in `next.config.*`) and looks for a literal `rawSql: true|false`
 * inside it, without executing the file — codegen has no TypeScript loader
 * and this must not run arbitrary user code.
 *
 * Only handles the common case: `rawSql` written as a literal boolean in
 * the config source. A value computed from a variable, function call, or
 * spread is not detected — callers should treat `'unknown'` as "assume
 * `true`, but warn", matching `withPublicDb`/`withUserDb`'s own default.
 *
 * @param cwd Project root to search from (where `next.config.*` is expected).
 * @returns Whether `rawSql` was found `true`/`false`, or `'unknown'` with a
 * human-readable reason (no next.config found, no alias, no db.supabase
 * block, or the value isn't a literal boolean).
 */
export default function resolveRawSql(cwd: string): RawSqlResolution;
