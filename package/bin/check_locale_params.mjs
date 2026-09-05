#!/usr/bin/env node
// Usage: cfni-check-locale-params [--app-dir=src/app] [--mode=off|report|fix] [--locale-param=locale] [--skip=a/page.tsx,b/page.tsx] [--verbose]
// Env equivalents: CFNI_LOCALE_PARAMS_APP_DIR, CFNI_LOCALE_PARAMS_MODE, CFNI_LOCALE_PARAMS_LOCALE_PARAM, CFNI_LOCALE_PARAMS_SKIP (comma-separated), CFNI_LOCALE_PARAMS_VERBOSE.
import { resolve } from 'node:path';
import { checkLocaleParams } from '../dist/src/locale_params_check/check_locale_params.js';

function argValue(name) {
    const prefix = `--${name}=`;
    const arg = process.argv.slice(2).find((a) => a.startsWith(prefix));
    return arg ? arg.slice(prefix.length) : undefined;
}

const appDir = resolve(argValue('app-dir') ?? process.env.CFNI_LOCALE_PARAMS_APP_DIR ?? 'src/app');
const mode = argValue('mode') ?? process.env.CFNI_LOCALE_PARAMS_MODE ?? 'report';
const localeParam = argValue('locale-param') ?? process.env.CFNI_LOCALE_PARAMS_LOCALE_PARAM ?? 'locale';
const skipRaw = argValue('skip') ?? process.env.CFNI_LOCALE_PARAMS_SKIP ?? '';
const skip = skipRaw.split(',').map((s) => s.trim()).filter(Boolean).map((s) => resolve(s));
const verbose = process.argv.includes('--verbose') || process.env.CFNI_LOCALE_PARAMS_VERBOSE === 'true';

const reports = await checkLocaleParams({ appDir, mode, localeParam, skip, verbose });

if (reports.length === 0) {
    console.log(mode === 'off' ? 'checkLocaleParams: disabled (mode=off).' : `checkLocaleParams: no [${localeParam}]-scoped page/layout/loading files found under ${appDir}.`);
} else if (!verbose) {
    for (const { file, action } of reports) console.log(`${action.padEnd(24)} ${file}`);
}
