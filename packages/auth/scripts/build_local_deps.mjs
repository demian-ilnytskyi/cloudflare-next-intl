import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packagesDir = resolve(__dirname, '../..');

for (const pkg of ['errors', 'intl']) {
    const tsconfig = resolve(packagesDir, pkg, 'tsconfig.json');
    if (existsSync(tsconfig)) {
        execSync(`npx tsc --project ${tsconfig}`, { stdio: 'inherit' });
        const writeType = resolve(packagesDir, pkg, 'scripts/write_dist_type.mjs');
        if (existsSync(writeType)) {
            execSync(`node ${writeType}`, { stdio: 'inherit' });
        }
    }
}
