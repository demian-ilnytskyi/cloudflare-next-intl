# Fix ESM Build Resolution & Package Import Simplicity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `cloudflare-next-intl`'s published build resolvable by **plain Node ESM**, not only by bundlers — which also restores Import Cost's ability to measure it.

> **Severity: improvement, not an outage.** The package currently works in
> bundler-based consumers (Vite/webpack/Next). Verified against the real
> consumer `/Volumes/External/clarivant/CRV`, which depends on
> `cloudflare-next-intl@^0.8.61`: Vite's resolver returns `OK` for
> `cloudflare-next-intl`, `/metadata`, and `/getCookieClient`. The same three
> specifiers fail under plain `node import()`. Nothing shipped is broken for
> existing apps; this plan removes the bundler-only constraint.

**Architecture:** The package compiles with `moduleResolution: "bundler"`, which lets `tsc` emit extensionless relative specifiers (`export * from './src'`). Bundlers tolerate this; Node's ESM resolver requires explicit extensions, so every entry point fails **outside a bundler** (plain Node, and any tool resolving Node-style — including Import Cost). Fix = add explicit `.js` / `/index.js` extensions to all relative specifiers in `src/`, switch to `moduleResolution: "nodenext"` so the compiler enforces this permanently, and add a smoke test that imports every `exports` subpath so this can never regress silently.

**Tech Stack:** TypeScript 5.x (`tsc`), Node ESM, Vitest, Next.js/Cloudflare Workers consumers.

**Spec:** No separate spec doc — the defect and its evidence are captured in "Problem Statement" below, which this plan argues from.

---

## Problem Statement (verified evidence, not assumption)

All findings below were reproduced against the current working tree.

**0. Scope of impact: bundler consumers are fine; Node-style consumers are not.**

Tested in `/Volumes/External/clarivant/CRV` (a real app depending on this package):

| Resolver | `cloudflare-next-intl` | `/metadata` | `/getCookieClient` |
|---|---|---|---|
| Vite (`pluginContainer.resolveId`) | ✅ OK | ✅ OK | ✅ OK |
| Plain Node (`import()`) | ❌ `ERR_UNSUPPORTED_DIR_IMPORT` | ❌ `ERR_MODULE_NOT_FOUND` | ❌ `ERR_MODULE_NOT_FOUND` |

Everything below describes the Node-side failure. Existing bundler-based apps
are unaffected and will stay working after the fix.

**1. The published build cannot be imported by Node ESM.**

```
$ node -e "import('./dist/index.js')"
FAIL: ERR_UNSUPPORTED_DIR_IMPORT
Directory import '.../dist/src' is not supported resolving ES modules
imported from '.../dist/index.js'
```

`dist/index.js` is literally `export * from './src';` — a bare directory import, which is illegal in ESM.

**2. This is not limited to the root entry. Every subpath is broken:**

| Subpath | Result |
|---|---|
| `./image` | `ERR_MODULE_NOT_FOUND` |
| `./client` | `ERR_MODULE_NOT_FOUND` |
| `./server` | `ERR_MODULE_NOT_FOUND` |
| `./middleware` | `ERR_MODULE_NOT_FOUND` |
| `./cookieConsent` | `ERR_MODULE_NOT_FOUND` |
| `./errorHandling` | `ERR_MODULE_NOT_FOUND` |

All 53 declared `exports` subpaths point at files that **do exist** (0 missing) — the files are simply unloadable because of their internal specifiers. 80 of 170 emitted `.js` files contain extensionless relative imports.

**3. Root cause is a single tsconfig setting.** `tsconfig.json` sets `moduleResolution: "bundler"`. That mode permits extensionless specifiers, and `tsc` emits them **verbatim** with no rewriting. The result compiles cleanly and ships broken. Confirmed by isolated reproduction:

- With `moduleResolution: "bundler"` → `export * from './b';` emitted, fails at runtime.
- With `moduleResolution: "nodenext"` → **hard compile error**, so the bug becomes unshippable:
  ```
  error TS2835: Relative import paths need explicit file extensions in ECMAScript
  imports when '--moduleResolution' is 'node16' or 'nodenext'. Did you mean './b.js'?
  ```
- With `./b.js` + `nodenext` → emits `export * from './b.js';` and `import()` returns `OK`. Fix verified end-to-end.

**4. Why the Import Cost extension shows nothing for this package (the unanswered question).** Import Cost resolves the import, bundles it with webpack/esbuild in the background, and reports the size. It cannot do that here: resolution of `cloudflare-next-intl` and every one of its subpaths fails with `ERR_MODULE_NOT_FOUND` / `ERR_UNSUPPORTED_DIR_IMPORT` before any bundling starts. With no successful resolve there is no size to report, and the extension silently renders no decoration. This is a **symptom of defect #1, not a separate problem** — it works for other packages because their builds resolve. Fixing the specifier extensions fixes the extension display too; no extension configuration change is required.

**5. Secondary defect:** `dist/package.json` has no `"type"` field, producing
`MODULE_TYPELESS_PACKAGE_JSON` warnings and forcing Node to re-parse each file to detect module type ("This incurs a performance overhead").

### Scale of the change (measured)

| Category | Count | Rewrite |
|---|---|---|
| Relative imports resolving to a **file** | 458 | append `.js` |
| Relative imports resolving to a **directory** | 7 | append `/index.js` |
| **Ambiguous** (both `foo.ts` and `foo/index.ts` exist) | **0** | — |

Zero ambiguous cases means the codemod is fully deterministic. The 7 directory imports are: `./client`, `./config`, `../../config`, `./general`, `./server`, `./theme_switcher`.

### Rejected alternative: consolidating into one big barrel import

Considered and **rejected**. Collapsing the 53 subpaths into a single entry would:
- Break tree-shaking. The subpaths are what let a consumer importing `./getCookieClient` avoid pulling in `sharp`, `firebase`, `pg`, and `embedded-postgres`. `sideEffects: false` only helps if entry points stay granular.
- Force server-only code (`middleware`, `firebaseAuthMiddleware`) into the same graph as client code, breaking the `react-server` conditional exports that currently split `./use` and `./useFirebaseAuthUser`.
- Make bundle size *larger*, which is the opposite of the goal.

The package's import surface is not the problem — the broken build is. Subpaths stay as they are.

### Explicitly out of scope

Dependency restructuring (moving `sharp` / `firebase` / `pg` / `embedded-postgres` between `dependencies` / `optionalDependencies` / `peerDependencies`). The user reverted an earlier attempt at this and asked for no dependency changes. Do not touch the `dependencies` block.

## Global Constraints

- **Do not modify** the `dependencies`, `optionalDependencies`, or `peerDependencies` blocks of `package/package.json`.
- **Do not add or remove** any subpath in the `exports` map, and do not change what any subpath points to. All 53 stay.
- Package root is `package/`. All paths below are relative to it unless stated.
- Package is ESM-only (`"type": "module"`); do not introduce CommonJS output.
- Build command is `npm run build` (= `tsc`). Test command is `npx vitest run`.
- Use the repo-local compiler at `node_modules/.bin/tsc`. Do **not** use `npx tsc` — `npx` injects extra args and fails with `TS5042`.
- Never hand-edit anything in `dist/`; it is generated output.

---

### Task 1: Add a smoke test that every export subpath is importable

This task first proves the bug at the test level, so the fix in Tasks 2–3 has an objective pass/fail gate. The test is written against the built output, so it must run after a build.

**Files:**
- Create: `scripts/check_exports.mjs`
- Test: run directly with `node`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `scripts/check_exports.mjs`, an executable script that exits `0` if every `exports` subpath imports cleanly and exits `1` with a per-subpath failure list otherwise. Tasks 2, 3, and 4 re-run this exact script as their verification gate.

- [ ] **Step 1: Write the checker script**

Create `scripts/check_exports.mjs`:

```javascript
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

function targets(entry) {
  if (typeof entry === 'string') return [entry];
  if (entry && typeof entry === 'object') {
    if (typeof entry.import === 'string') return [entry.import];
    return Object.values(entry).flatMap(targets);
  }
  return [];
}

const failures = [];
let checked = 0;

for (const [subpath, entry] of Object.entries(pkg.exports ?? {})) {
  for (const target of targets(entry)) {
    checked++;
    const url = pathToFileURL(resolve(root, target)).href;
    try {
      await import(url);
    } catch (error) {
      failures.push({ subpath, target, code: error.code ?? 'ERROR', message: String(error.message).split('\n')[0] });
    }
  }
}

if (failures.length > 0) {
  console.error(`FAIL: ${failures.length}/${checked} export targets are not importable\n`);
  for (const f of failures) {
    console.error(`  ${f.subpath}\n    -> ${f.target}\n    ${f.code}: ${f.message}`);
  }
  process.exit(1);
}

console.log(`OK: all ${checked} export targets import cleanly`);
```

- [ ] **Step 2: Build, then run the checker to verify it FAILS**

```bash
cd package
npm run build
node scripts/check_exports.mjs
```

Expected: exit code `1`, output beginning `FAIL:` and listing subpaths with `ERR_UNSUPPORTED_DIR_IMPORT` and `ERR_MODULE_NOT_FOUND`. This is the bug reproduced as a test. Do not proceed until you have seen this failure.

- [ ] **Step 3: Wire it into package scripts**

In `package/package.json`, inside the existing `"scripts"` block, add:

```json
"check:exports": "node scripts/check_exports.mjs"
```

Leave every other script unchanged.

- [ ] **Step 4: Commit**

```bash
git add package/scripts/check_exports.mjs package/package.json
git commit -m "test: add export-subpath import smoke check"
```

---

### Task 2: Add explicit extensions to all relative specifiers in src/

**Files:**
- Create: `scripts/add_import_extensions.mjs` (one-shot codemod; deleted in Step 6)
- Modify: ~229 files under `src/` (mechanical, by codemod)

**Interfaces:**
- Consumes: `scripts/check_exports.mjs` from Task 1.
- Produces: a `src/` tree in which every relative `import`/`export` specifier ends in `.js`, `/index.js`, `.json`, or `.css`. Task 3 depends on this being complete, because `nodenext` will not compile otherwise.

- [ ] **Step 1: Write the codemod**

Create `scripts/add_import_extensions.mjs`. It resolves each specifier against the filesystem to decide between `.js` and `/index.js`, and leaves already-extended specifiers alone:

```javascript
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';

const SRC = resolve(process.cwd(), 'src');
const SPEC = /(\bfrom\s*|\bimport\s*\(\s*)(['"])(\.\.?\/[^'"]*)\2/g;
const KEEP = /\.(js|json|css|mjs|cjs)$/;

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

let changedFiles = 0;
let changedSpecs = 0;
const unresolved = [];

for (const file of walk(SRC)) {
  const before = readFileSync(file, 'utf8');
  const after = before.replace(SPEC, (match, head, quote, spec) => {
    if (KEEP.test(spec)) return match;
    const base = resolve(dirname(file), spec);
    const isFile = ['.ts', '.tsx'].some((ext) => existsSync(base + ext));
    const isDir =
      existsSync(base) &&
      statSync(base).isDirectory() &&
      ['.ts', '.tsx'].some((ext) => existsSync(join(base, 'index' + ext)));

    let next;
    if (isFile) next = `${spec}.js`;
    else if (isDir) next = `${spec}/index.js`;
    else {
      unresolved.push(`${file}: ${spec}`);
      return match;
    }
    changedSpecs++;
    return `${head}${quote}${next}${quote}`;
  });

  if (after !== before) {
    writeFileSync(file, after);
    changedFiles++;
  }
}

console.log(`rewrote ${changedSpecs} specifiers across ${changedFiles} files`);
if (unresolved.length) {
  console.error(`\nUNRESOLVED (${unresolved.length}) — fix by hand:`);
  for (const u of unresolved) console.error('  ' + u);
  process.exit(1);
}
```

Note the `isFile` check runs before `isDir`: measurement showed 0 ambiguous cases, so the order is not load-bearing, but it keeps behavior deterministic if one is ever introduced.

- [ ] **Step 2: Run the codemod**

```bash
cd package
node scripts/add_import_extensions.mjs
```

Expected: `rewrote 465 specifiers across 229 files` (counts may differ slightly if test files changed), and **no** `UNRESOLVED` section. If anything is listed as unresolved, fix those specifiers by hand before continuing.

- [ ] **Step 3: Verify the 7 directory imports got `/index.js`, not `.js`**

```bash
grep -rnE "from ['\"]\.\.?/(config|client|server|general|theme_switcher)['\"]" --include="*.ts" --include="*.tsx" src
```

Expected: no output (all rewritten). Then confirm they became directory-index imports:

```bash
grep -rn "/index.js'" --include="*.ts" --include="*.tsx" src | head
```

Expected: entries such as `export * from './config/index.js';`.

- [ ] **Step 4: Confirm the source still typechecks and tests still pass**

```bash
npm run build
npx vitest run
```

Expected: build succeeds; test suite passes as it did before this task. The specifiers are still valid under `bundler` resolution, so nothing should regress here.

- [ ] **Step 5: Run the export checker — it should now PASS**

```bash
node scripts/check_exports.mjs
```

Expected: `OK: all N export targets import cleanly`. This is the moment the bug from Task 1 Step 2 is fixed. If any subpath still fails, the codemod missed a specifier — fix it and re-run.

- [ ] **Step 6: Delete the one-shot codemod and commit**

```bash
rm scripts/add_import_extensions.mjs
git add -A package/src package/scripts
git commit -m "fix: add explicit file extensions to relative ESM specifiers"
```

---

### Task 3: Switch to nodenext so the compiler prevents regressions

Task 2 fixed the existing specifiers. This task makes it impossible to reintroduce the bug.

**Files:**
- Modify: `tsconfig.json` (`compilerOptions.moduleResolution`, `compilerOptions.module`)

**Interfaces:**
- Consumes: extension-complete `src/` from Task 2.
- Produces: a build configuration under which any extensionless relative specifier is a compile error (`TS2835`).

- [ ] **Step 1: Verify nodenext currently rejects the old style (guard test)**

Before changing anything, confirm the enforcement you are about to enable actually fires:

```bash
cd package
node_modules/.bin/tsc --noEmit --module nodenext --moduleResolution nodenext \
  --target es2020 --jsx react-jsx --skipLibCheck src/index.ts
```

Expected after Task 2: no `TS2835` errors (specifiers are already correct). If `TS2835` appears, Task 2 is incomplete — go back and finish it.

- [ ] **Step 2: Update tsconfig.json**

In `package/tsconfig.json`, change these two `compilerOptions` values:

```json
"module": "nodenext",
"moduleResolution": "nodenext"
```

They are currently `"esnext"` and `"bundler"`. Change nothing else in the file.

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

Expected: build succeeds with no `TS2835`. If errors appear for specifiers the codemod skipped, add the missing extension to each file the error names, then rebuild.

- [ ] **Step 4: Verify enforcement is live**

Prove the guard works by temporarily breaking one import:

```bash
node_modules/.bin/tsc --noEmit -p tsconfig.json
sed -i.bak "s|from './config/index.js'|from './config'|" src/index.ts
node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | head -3
mv src/index.ts.bak src/index.ts
```

Expected: the middle command prints `error TS2835: Relative import paths need explicit file extensions...`. Confirm `src/index.ts` is restored afterward (`git diff --stat src/index.ts` shows nothing).

- [ ] **Step 5: Run the full gate**

```bash
npm run build && node scripts/check_exports.mjs && npx vitest run
```

Expected: build OK, `OK: all N export targets import cleanly`, tests pass.

- [ ] **Step 6: Commit**

```bash
git add package/tsconfig.json
git commit -m "build: enforce explicit ESM extensions via nodenext resolution"
```

---

### Task 4: Declare the module type in dist and gate publishes on the checker

Fixes the `MODULE_TYPELESS_PACKAGE_JSON` warning and its per-file re-parse cost, and makes a broken build unpublishable.

**Files:**
- Modify: `package.json` (`scripts`)
- Create: `scripts/write_dist_type.mjs`

**Interfaces:**
- Consumes: `scripts/check_exports.mjs` (Task 1), working build (Tasks 2–3).
- Produces: `dist/package.json` containing `{"type":"module"}`; a `prepublishOnly` script that fails the publish if any subpath is unimportable.

- [ ] **Step 1: Write the dist type stamper**

Create `scripts/write_dist_type.mjs`:

```javascript
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
mkdirSync(dist, { recursive: true });
writeFileSync(resolve(dist, 'package.json'), JSON.stringify({ type: 'module' }, null, 2) + '\n');
console.log('wrote dist/package.json {"type":"module"}');
```

- [ ] **Step 2: Wire it into the build**

In `package/package.json` `"scripts"`, change `build` and add `prepublishOnly`:

```json
"build": "tsc && node scripts/write_dist_type.mjs",
"prepublishOnly": "npm run build && npm run check:exports"
```

If a `prepublishOnly` script already exists, append `&& npm run check:exports` to it rather than replacing it.

- [ ] **Step 3: Rebuild and confirm the warning is gone**

```bash
cd package
npm run build
node -e "import('./dist/index.js').then(()=>console.log('OK')).catch(e=>console.log('FAIL',e.code))" 2>&1
```

Expected: prints `OK`, with **no** `MODULE_TYPELESS_PACKAGE_JSON` warning (compare against the original failure in the Problem Statement).

- [ ] **Step 4: Confirm the publish gate blocks a broken build**

```bash
npm run check:exports
```

Expected: `OK: all N export targets import cleanly`.

- [ ] **Step 5: Commit**

```bash
git add package/package.json package/scripts/write_dist_type.mjs
git commit -m "build: stamp dist module type and gate publish on export check"
```

---

### Task 5: Verify a real consumer resolves the package, and confirm Import Cost

End-to-end confirmation against a consumer outside the package directory — the condition Import Cost actually exercises.

**Files:**
- No source changes. Verification only.

**Interfaces:**
- Consumes: the fixed build from Tasks 2–4.
- Produces: confirmation the original two symptoms are resolved.

- [ ] **Step 1: Pack the package**

```bash
cd package
npm pack
```

Expected: produces `cloudflare-next-intl-<version>.tgz`. Note the filename.

- [ ] **Step 2: Install it into a scratch consumer and import several subpaths**

```bash
SCRATCH=/private/tmp/claude-501/-Volumes-External-own-projects-cloudflare-next-intl/3dee18d9-c28a-4e6f-817a-dff39c8d7b20/scratchpad/consumer
rm -rf "$SCRATCH" && mkdir -p "$SCRATCH" && cd "$SCRATCH"
echo '{"name":"consumer","type":"module","private":true}' > package.json
npm install /Volumes/External/own_projects/cloudflare-next-intl/package/cloudflare-next-intl-*.tgz --ignore-scripts
node -e "
const subs=['cloudflare-next-intl','cloudflare-next-intl/getCookieClient','cloudflare-next-intl/metadata','cloudflare-next-intl/errorHandling'];
Promise.all(subs.map(s=>import(s).then(()=>['OK',s]).catch(e=>[e.code,s])))
  .then(r=>r.forEach(([c,s])=>console.log(c.padEnd(22),s)));
"
```

Expected: every line reads `OK`. Before this plan, all of these failed with `ERR_MODULE_NOT_FOUND` / `ERR_UNSUPPORTED_DIR_IMPORT`.

Note: some subpaths legitimately require a bundler/React-server context or an optional native dep (e.g. `sharp`); the four above are chosen to be safe in plain Node. If a *different* subpath fails, check whether it fails for that reason before treating it as a regression.

- [ ] **Step 3: Confirm Import Cost now displays a size**

Open any project file that imports `cloudflare-next-intl` (or add a scratch line `import { } from 'cloudflare-next-intl/metadata';`) and reload the VS Code window. The Import Cost decoration should now appear.

If it still does not, the remaining cause is extension-side, not package-side — Import Cost is unmaintained and its bundled esbuild/webpack can lag on newer syntax. Since resolution is now proven working via Step 2, prefer the maintained fork **Import Cost Fast**'s successor or verify size directly:

```bash
npx -y esbuild --bundle --minify --format=esm \
  --external:react --external:next \
  "$SCRATCH/node_modules/cloudflare-next-intl/dist/src/general/metadata.js" | wc -c
```

- [ ] **Step 4: Clean up the tarball and commit any residual changes**

```bash
cd /Volumes/External/own_projects/cloudflare-next-intl/package
rm -f cloudflare-next-intl-*.tgz
git status --short
```

Expected: no unexpected modified files. Commit anything outstanding.

---

## Self-Review

**Spec coverage** — every item in the Problem Statement maps to a task:

| Finding | Task |
|---|---|
| #1 root entry `ERR_UNSUPPORTED_DIR_IMPORT` | 2 |
| #2 all 53 subpaths unimportable | 1 (detects), 2 (fixes), 5 (confirms via real consumer) |
| #3 `moduleResolution: "bundler"` root cause | 3 |
| #4 Import Cost shows nothing | 2 (fixes cause), 5 Step 3 (confirms) |
| #5 `MODULE_TYPELESS_PACKAGE_JSON` | 4 |
| Regression prevention | 1 (`check:exports`), 3 (`TS2835`), 4 (`prepublishOnly`) |
| "no dependency changes" | Global Constraints — dependency blocks are off-limits |
| "big barrel import instead?" | Rejected alternative, with reasoning |

**Placeholder scan:** No TBDs. Every script is complete and runnable; every step states its exact command and expected output.

**Type consistency:** `scripts/check_exports.mjs` is created once (Task 1) and referenced by the same path and same `check:exports` script name in Tasks 2, 3, and 4. `scripts/write_dist_type.mjs` is created and referenced only in Task 4. `scripts/add_import_extensions.mjs` is created and deleted within Task 2.

**Ordering:** Task 2 must precede Task 3 — enabling `nodenext` before fixing specifiers would produce 465 compile errors at once.
