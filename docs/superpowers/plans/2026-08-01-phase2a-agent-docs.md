# Phase 2a: AI/Agent Docs Implementation Plan

> **SUPERSEDED (2026-08-01):** the user reversed this decision — docs live in
> `.agent/.sub-rules/packages/**`, not `docs/ai/*.md`. Do not execute this
> plan. See `.agent/.sub-rules/packages.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend this repo's existing `docs/ai/*.md` lazy-doc system with entries for the upcoming `firebase_auth` module and performance work, and record in project memory that `docs/ai/*.md` (not `.agent/.sub-rules`) is this repo's convention.

**Architecture:** Pure documentation — no code changes. Two new stub topic files, one index update, one memory file + index pointer.

**Tech Stack:** Markdown only.

## Global Constraints

- Do not create `.agent/.sub-rules/**` in this repo — that pattern belongs to a different project (`planner-flutter`); confirmed via investigation in `docs/superpowers/specs/2026-08-01-phase2a-agent-docs-design.md`.
- Stub files must not claim content that doesn't exist yet — say plainly "not yet implemented."
- No production code changes.

---

### Task 1: Add index entries and stub topic files

**Files:**
- Modify: `docs/ai/index.md`
- Create: `docs/ai/firebase-auth.md`
- Create: `docs/ai/performance.md`

**Interfaces:**
- Produces: two new doc file paths (`docs/ai/firebase-auth.md`, `docs/ai/performance.md`) that Phase 2b and Phase 2c plans will overwrite with real content.

- [ ] **Step 1: Create the firebase-auth stub**

Create `docs/ai/firebase-auth.md`:

```markdown
# Firebase Auth Module

Not yet implemented — see `docs/superpowers/specs/2026-08-01-phase2b-firebase-auth-module-design.md`.
This file will document `package/src/firebase_auth/**` once that phase lands.
```

- [ ] **Step 2: Create the performance stub**

Create `docs/ai/performance.md`:

```markdown
# Performance Testing & SSR/Cache Conventions

Not yet implemented — see `docs/superpowers/specs/2026-08-01-phase2c-performance-design.md`.
This file will document benchmark/perf-test conventions under `package/src/**` once that phase lands.
```

- [ ] **Step 3: Add both to the index**

Edit `docs/ai/index.md`, adding two bullets in the same style as the existing ones (after the theme-switcher bullet, before the testing bullet):

```markdown
- **Touching `package/src/firebase_auth/**`** (optional Firebase auth
  submodule) → [`docs/ai/firebase-auth.md`](firebase-auth.md)
- **Writing or reviewing benchmarks/perf tests under `package/src/**`** →
  [`docs/ai/performance.md`](performance.md)
```

- [ ] **Step 4: Verify links resolve**

Run: `ls docs/ai/firebase-auth.md docs/ai/performance.md`
Expected: both files listed, no error.

- [ ] **Step 5: Commit**

```bash
git add docs/ai/index.md docs/ai/firebase-auth.md docs/ai/performance.md
git commit -m "docs: stub firebase-auth and performance topic docs, index them"
```

---

### Task 2: Record the doc-convention memory

**Files:**
- Create: `/Users/demian-ilnytskyi/.claude/projects/-Volumes-External-own-projects-cloudflare-next-intl/memory/repo_doc_convention.md`
- Modify: `/Users/demian-ilnytskyi/.claude/projects/-Volumes-External-own-projects-cloudflare-next-intl/memory/MEMORY.md`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: a `reference`-type memory future sessions in this project read before proposing a `.agent/.sub-rules` layout here.

- [ ] **Step 1: Check whether MEMORY.md exists yet**

Run: `ls /Users/demian-ilnytskyi/.claude/projects/-Volumes-External-own-projects-cloudflare-next-intl/memory/MEMORY.md`

If it doesn't exist, create it fresh with just a title line (`# Memory Index`) before the append step below.

- [ ] **Step 2: Write the memory file**

Create `/Users/demian-ilnytskyi/.claude/projects/-Volumes-External-own-projects-cloudflare-next-intl/memory/repo_doc_convention.md`:

```markdown
---
name: repo-doc-convention
description: This repo's agent-doc convention is docs/ai/*.md, not .agent/.sub-rules
metadata:
  type: reference
---

`cloudflare-next-intl` uses `docs/ai/*.md` (indexed from `docs/ai/index.md`,
referenced by `.claude/CLAUDE.md`'s "Codebase Knowledge" section) as its
lazy-loaded agent-doc system — one topic file per source area, read on demand.

This repo does NOT use the `.agent/.sub-rules/**` layer-rule-index pattern —
that convention belongs to a different project (the `planner-flutter` global
rules layout under `/Users/demian-ilnytskyi/.claude/.sub-rules/`). A stray
`.agent/` directory exists in this repo's working tree but is an unrelated
plugin cache directory, not a doc system.

**Why:** confirmed by direct investigation during Phase 2a planning
(2026-08-01) — the two conventions were being conflated.

**How to apply:** when asked to add or organize agent/AI docs in this repo,
extend `docs/ai/*.md` + `docs/ai/index.md`. Do not create `.agent/.sub-rules`
here.
```

- [ ] **Step 3: Add the index pointer**

Append one line to `/Users/demian-ilnytskyi/.claude/projects/-Volumes-External-own-projects-cloudflare-next-intl/memory/MEMORY.md`:

```markdown
- [Repo doc convention](repo_doc_convention.md) — docs/ai/*.md is this repo's agent-doc system, not .agent/.sub-rules
```

- [ ] **Step 4: Verify**

Run: `cat /Users/demian-ilnytskyi/.claude/projects/-Volumes-External-own-projects-cloudflare-next-intl/memory/MEMORY.md`
Expected: the new line present, file under 200 lines total.

No commit step — memory files live outside the git repo, in the Claude Code project data directory.
