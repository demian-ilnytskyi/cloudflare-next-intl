// Shared by cfni-db-codegen and cfni-db-install-exec: copies cfni_exec.sql
// (and its pgTAP test file) from this package's own `supabase/` folder into
// the consuming project, gated on the project's `db.supabase.rawSql` setting.
import { join } from 'node:path';
import resolveRawSql from '../dist/src/db/resolve_raw_sql.js';
import { installExecFile } from '../dist/src/db/install_exec.js';

const PACKAGE_ROOT = new URL('..', import.meta.url).pathname;

/**
 * @param {import('../dist/src/db/codegen_paths.js').CodegenPaths} paths
 * @param {string} cwd
 */
export function runInstallExecStep(paths, cwd) {
    if (paths.skipExec) {
        console.log('ℹ️  Skipping cfni_exec install — --skip-exec passed.');
        return;
    }

    const rawSql = resolveRawSql(cwd);
    if (rawSql.status === 'false') {
        console.log(`ℹ️  Skipping cfni_exec install — db.supabase.rawSql is false (${rawSql.reason}).`);
        return;
    }
    if (rawSql.status === 'unknown') {
        console.warn(`⚠️  Could not determine db.supabase.rawSql (${rawSql.reason}) — assuming true and installing cfni_exec. Pass --skip-exec, or set db.supabase.rawSql: false, to turn this off.`);
    }

    const files = [
        { sourcePath: join(PACKAGE_ROOT, 'supabase/cfni_exec.sql'), targetPath: paths.rpcFile },
        { sourcePath: join(PACKAGE_ROOT, 'supabase/tests/cfni_exec.sql'), targetPath: paths.testsFile },
    ];

    for (const file of files) {
        const result = installExecFile(file, paths.force);
        const icon = { created: '✅', updated: '✅', unchanged: 'ℹ️', 'skipped-differs': '⚠️', 'skipped-missing-source': '⚠️' }[result.action];
        console.log(`${icon} ${result.targetPath}: ${result.message}`);
    }
}
