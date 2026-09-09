#!/usr/bin/env node
// Usage: cfni-check-dynamic-pages [--app-dir=src/app] [--mode=off|report|fix] [--target=next|vinext] [--skip=a/page.tsx,b/page.tsx]
// Env equivalents: CFNI_DYNAMIC_PAGES_APP_DIR, CFNI_DYNAMIC_PAGES_MODE, CFNI_DYNAMIC_PAGES_TARGET, CFNI_DYNAMIC_PAGES_SKIP (comma-separated).
import { resolve } from 'node:path';
import { checkDynamicPages } from '../dist/src/dynamic_pages_check/check_dynamic_pages.js';

function argValue(name) {
    const prefix = `--${name}=`;
    const arg = process.argv.slice(2).find((a) => a.startsWith(prefix));
    return arg ? arg.slice(prefix.length) : undefined;
}

const appDir = resolve(argValue('app-dir') ?? process.env.CFNI_DYNAMIC_PAGES_APP_DIR ?? 'src/app');
const mode = argValue('mode') ?? process.env.CFNI_DYNAMIC_PAGES_MODE ?? 'report';
const target = argValue('target') ?? process.env.CFNI_DYNAMIC_PAGES_TARGET ?? 'next';
const skipRaw = argValue('skip') ?? process.env.CFNI_DYNAMIC_PAGES_SKIP ?? '';
const skip = skipRaw.split(',').map((s) => s.trim()).filter(Boolean).map((s) => resolve(s));

const reports = await checkDynamicPages({ appDir, mode, target, skip });

if (reports.length === 0) {
    console.log(mode === 'off' ? 'checkDynamicPages: disabled (mode=off).' : `checkDynamicPages: no page/route files found under ${appDir}.`);
} else {
    for (const { file, action } of reports) console.log(`${action.padEnd(24)} ${file}`);
}
