import { execSync } from 'child_process';
import { existsSync, symlinkSync, unlinkSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const cwdNodeModules = resolve(process.cwd(), 'node_modules');
if (!existsSync(cwdNodeModules)) {
    process.exit(0);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const packagesDir = resolve(__dirname, '../..');

const depsToBuild = process.argv.slice(2);

for (const pkg of depsToBuild) {
    const pkgDir = resolve(packagesDir, pkg);
    const tsconfig = resolve(pkgDir, 'tsconfig.json');
    if (!existsSync(tsconfig)) continue;

    const targetNm = resolve(pkgDir, 'node_modules');
    if (!existsSync(targetNm)) {
        symlinkSync(cwdNodeModules, targetNm, 'junction');
    }

    execSync(`npx tsc --project ${tsconfig}`, { stdio: 'inherit' });

    const writeType = resolve(pkgDir, 'scripts/write_dist_type.mjs');
    if (existsSync(writeType)) {
        execSync(`node ${writeType}`, { stdio: 'inherit' });
    }
}
