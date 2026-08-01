# RTK — Rust Token Killer (Token-Optimized Commands)

## Golden rule

**Always prefix CLI invocations with `rtk`.** If RTK has a dedicated filter, it
uses it; otherwise it passes through unchanged — `rtk` is always safe.

In command chains with `&&`, prefix **every** segment:

```bash
# ❌ Wrong
git add . && git commit -m "msg" && git push

# ✅ Correct
rtk git add . && rtk git commit -m "msg" && rtk git push
```

## Commands by workflow

### Build & compile (70–90% savings)

```bash
rtk tsc                 # TypeScript errors grouped by file/code (83%)
rtk lint                # ESLint/Biome violations grouped (84%)
rtk prettier --check    # Files needing format only (70%)
rtk cargo build         # Cargo build output
rtk cargo check         # Cargo check output
rtk cargo clippy        # Clippy warnings grouped by file (80%)
rtk next build          # Next.js build with route metrics (87%)
```

### Test (60–99% savings)

```bash
rtk jest                # Jest failures only (99.5%)
rtk vitest              # Vitest failures only (99.5%)
rtk pytest              # Python test failures only (90%)
rtk playwright test     # Playwright failures only (94%)
rtk cargo test          # Cargo test failures only (90%)
rtk go test             # Go test failures only (90%)
rtk test <cmd>          # Generic test wrapper — failures only
```

### Git (59–80% savings)

```bash
rtk git status   # Compact status
rtk git log      # Compact log (all git flags work)
rtk git diff     # Compact diff (80%)
rtk git show     # Compact show (80%)
rtk git add      # Ultra-compact (59%)
rtk git commit   # Ultra-compact (59%)
rtk git push     # Ultra-compact
rtk git pull     # Ultra-compact
rtk git branch   # Compact branch list
rtk git fetch    # Compact fetch
rtk git stash    # Compact stash
rtk git worktree # Compact worktree
```

Git passthrough works for **all** subcommands.

### GitHub (26–87% savings)

```bash
rtk gh pr view <num>  # Compact PR view (87%)
rtk gh pr checks      # Compact PR checks (79%)
rtk gh run list       # Compact workflow runs (82%)
rtk gh issue list     # Compact issue list (80%)
rtk gh api            # Compact API responses (26%)
```

### JS/TS tooling (70–90% savings)

```bash
rtk pnpm list           # Compact dependency tree (70%)
rtk pnpm outdated       # Compact outdated packages (80%)
rtk pnpm install        # Compact install output (90%)
rtk npm run <script>    # Compact npm script output
rtk npx <cmd>           # Compact npx command output
rtk prisma              # Prisma without ASCII art (88%)
```

### Files & search (60–75% savings)

```bash
rtk ls <path>      # Tree format, compact (65%)
rtk read <file>    # Code reading with filtering (60%)
rtk grep <pattern> # Search grouped by file (75%). Format flags (-c, -l, -L, -o, -Z) run raw.
rtk find <pattern> # Find grouped by directory (70%)
```

### Analysis & debug (70–90% savings)

```bash
rtk err <cmd>       # Filter errors only from any command
rtk log <file>      # Deduplicated logs with counts
rtk json <file>     # JSON structure without values
rtk deps            # Dependency overview
rtk env             # Environment variables compact
rtk summary <cmd>   # Smart summary of command output
rtk diff            # Ultra-compact diffs
```

### Infrastructure (85% savings)

```bash
rtk docker ps     # Compact container list
rtk docker images # Compact image list
rtk docker logs   # Deduplicated logs
rtk kubectl get   # Compact resource list
rtk kubectl logs  # Deduplicated pod logs
```

### Network (65–70% savings)

```bash
rtk curl <url>  # Compact HTTP responses (70%)
rtk wget <url>  # Compact download output (65%)
```

### Meta

```bash
rtk gain              # Token-savings statistics
rtk gain --history    # Command history with savings
rtk discover          # Analyze sessions for missed RTK usage
rtk proxy <cmd>       # Run command without filtering (debug)
```

## Token-savings overview

| Category         | Commands                       | Typical savings |
| ---------------- | ------------------------------ | --------------- |
| Tests            | vitest, playwright, jest       | 90–99%          |
| Build            | tsc, lint, prettier            | 70–87%          |
| Git              | status, log, diff, add, commit | 59–80%          |
| GitHub           | gh pr, gh run, gh issue        | 26–87%          |
| Package managers | pnpm, npm, npx                 | 70–90%          |
| Files            | ls, read, grep, find           | 60–75%          |
| Infrastructure   | docker, kubectl                | 85%             |
| Network          | curl, wget                     | 65–70%          |

Overall: **60–90% token reduction** on common dev ops.
