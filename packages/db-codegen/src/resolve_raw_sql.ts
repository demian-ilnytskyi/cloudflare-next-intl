import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

export type RawSqlResolution =
    | { status: 'true' | 'false'; reason: string }
    | { status: 'unknown'; reason: string };

const NEXT_CONFIG_FILE_NAMES = ['next.config.ts', 'next.config.mts', 'next.config.js', 'next.config.mjs'];
const ALIAS_PATTERN = /['"]@intl-config['"]\s*:\s*(?:path\.resolve\([^,]*,\s*)?['"]([^'"]+)['"]/;
const RAW_SQL_PATTERN = /rawSql\s*:\s*(true|false)/;

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
export default function resolveRawSql(cwd: string): RawSqlResolution {
    const nextConfigPath = NEXT_CONFIG_FILE_NAMES.map((name) => join(cwd, name)).find((path) => existsSync(path));
    if (!nextConfigPath) {
        return { status: 'unknown', reason: `no next.config.* found in ${cwd}` };
    }

    const nextConfigSource = readFileSync(nextConfigPath, 'utf-8');
    const aliasMatch = ALIAS_PATTERN.exec(nextConfigSource);
    if (!aliasMatch) {
        return { status: 'unknown', reason: `no "@intl-config" alias found in ${nextConfigPath}` };
    }

    const aliasTarget = aliasMatch[1]!;
    const configPath = resolveConfigFile(isAbsolute(aliasTarget) ? aliasTarget : resolve(dirname(nextConfigPath), aliasTarget));
    if (!configPath) {
        return { status: 'unknown', reason: `"@intl-config" points at ${aliasTarget}, but no matching file was found` };
    }

    const configSource = readFileSync(configPath, 'utf-8');
    const rawSqlMatch = RAW_SQL_PATTERN.exec(configSource);
    if (!rawSqlMatch) {
        return { status: 'unknown', reason: `no literal "rawSql: true|false" found in ${configPath}` };
    }

    return {
        status: rawSqlMatch[1] === 'true' ? 'true' : 'false',
        reason: `found "rawSql: ${rawSqlMatch[1]}" in ${configPath}`,
    };
}

const CONFIG_EXTENSIONS = ['', '.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs'];

function resolveConfigFile(basePath: string): string | null {
    for (const extension of CONFIG_EXTENSIONS) {
        const candidate = `${basePath}${extension}`;
        if (existsSync(candidate)) return candidate;
    }
    return null;
}
