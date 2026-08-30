import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
const NEXT_CONFIG_FILE_NAMES = ['next.config.ts', 'next.config.mts', 'next.config.js', 'next.config.mjs'];
const ALIAS_PATTERN = /['"]@intl-config['"]\s*:\s*(?:path\.resolve\([^,]*,\s*)?['"]([^'"]+)['"]/;
const RAW_SQL_PATTERN = /rawSql\s*:\s*(true|false)/;
export default function resolveRawSql(cwd) {
    const nextConfigPath = NEXT_CONFIG_FILE_NAMES.map((name) => join(cwd, name)).find((path) => existsSync(path));
    if (!nextConfigPath) {
        return { status: 'unknown', reason: `no next.config.* found in ${cwd}` };
    }
    const nextConfigSource = readFileSync(nextConfigPath, 'utf-8');
    const aliasMatch = ALIAS_PATTERN.exec(nextConfigSource);
    if (!aliasMatch) {
        return { status: 'unknown', reason: `no "@intl-config" alias found in ${nextConfigPath}` };
    }
    const aliasTarget = aliasMatch[1];
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
function resolveConfigFile(basePath) {
    for (const extension of CONFIG_EXTENSIONS) {
        const candidate = `${basePath}${extension}`;
        if (existsSync(candidate))
            return candidate;
    }
    return null;
}
