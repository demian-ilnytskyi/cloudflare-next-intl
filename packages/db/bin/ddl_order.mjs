// Mirrors supabase/scripts/db_start.sh's `process_path`: within each
// directory, files/subdirectories listed in that directory's own `order.txt`
// apply first (in the listed order, recursing into subdirectories the same
// way), then everything else applies in alphabetical order. DDL is not
// generally safe to apply purely alphabetically — e.g. a function that calls
// another function must be created after it — so `order.txt` is how a
// project expresses the real dependency order.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function orderedEntries(dir) {
    const orderFile = join(dir, 'order.txt');
    const applied = new Set();
    const ordered = [];

    if (existsSync(orderFile)) {
        for (const rawLine of readFileSync(orderFile, 'utf8').split('\n')) {
            const line = rawLine.trim();
            if (!line || line.startsWith('#')) continue;
            const path = join(dir, line);
            if (existsSync(path)) {
                ordered.push(path);
                applied.add(line);
            }
        }
    }

    const rest = readdirSync(dir)
        .filter((name) => name !== 'order.txt' && !applied.has(name))
        .sort()
        .map((name) => join(dir, name));

    return [...ordered, ...rest];
}

/** Returns every `.sql` file under `dir`, in the order a project's own
 *  `order.txt` files (one per directory) say they must be applied. */
export function orderedSqlFiles(dir) {
    const files = [];
    for (const path of orderedEntries(dir)) {
        const stat = statSync(path);
        if (stat.isDirectory()) files.push(...orderedSqlFiles(path));
        else if (path.endsWith('.sql')) files.push(path);
    }
    return files;
}
