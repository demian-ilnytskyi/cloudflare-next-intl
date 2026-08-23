#!/usr/bin/env node
// Installs cfni_exec.sql (and its pgTAP test file) into the consuming
// project — the same step cfni-db-codegen runs after a successful
// generation, exposed standalone for when you only want this and nothing
// else (no drizzle-kit pull, no live Postgres needed).
//
// Usage: cfni-db-install-exec [--rpc-dir=…] [--tests-dir=…] [--force]
//
// Gated on the project's `db.supabase.rawSql` (read from `next.config.*`'s
// `@intl-config` alias) the same way cfni-db-codegen's step is — pass
// `--force`/CFNI_DB_FORCE_EXEC=true to overwrite an existing, differing file.
import resolveCodegenPaths from '../dist/src/db/codegen_paths.js';
import { runInstallExecStep } from './install_exec_step.mjs';

const paths = resolveCodegenPaths(process.argv.slice(2), process.env, process.cwd());
runInstallExecStep(paths, process.cwd());
