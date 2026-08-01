# Phase 2a: AI/Agent Docs for `.claude/` — Design

> **SUPERSEDED (2026-08-01):** the user explicitly reversed this decision —
> `docs/ai/*.md` was deleted and its content migrated into
> `.agent/.sub-rules/packages/**` instead. This spec/plan pair is kept for
> history only; do not execute it. See
> `.agent/.sub-rules/packages.md` for the current doc index.

## Context

This repo has two doc systems today:
- `docs/ai/*.md` — lazy-loaded topic docs for coding-agent context, referenced from `.claude/CLAUDE.md`'s "Codebase Knowledge" section and `docs/ai/index.md`.
- `.claude/` — commands, agents, skills, memory (currently empty of skills/agents specific to this repo; `.agent/` in this repo is a separate, unrelated plugin cache directory and is out of scope).

The original task asked for docs under `.agent/.sub-rules` — that path pattern belongs to a *different* project (the `planner-flutter` global rules layout referenced in the user's global CLAUDE.md, `/Users/demian-ilnytskyi/.claude/.sub-rules/`). This repo has no `.sub-rules` convention and does not use the lazy layer-rule-index pattern from that other project. This spec instead extends the doc system this repo actually has: `docs/ai/*.md`, adding the two topics phases 2b and 2c introduce (`firebase_auth` and performance/CI), plus a memory note.

## Goals

- `docs/ai/index.md` gains entries for the new `firebase_auth` module (Phase 2b) and for performance/CI conventions (Phase 2c), following the exact lazy-load pattern already used for `client.md`/`server.md`/etc.
- A new `docs/ai/firebase-auth.md` topic file exists as soon as Phase 2b lands (written in that phase, indexed here).
- A new `docs/ai/performance.md` topic file exists as soon as Phase 2c lands (written in that phase, indexed here).
- `.claude/memory/MEMORY.md` (project memory, not global) gets one entry recording that this repo's agent-doc convention is `docs/ai/*.md`, not `.agent/.sub-rules` — so a future session doesn't reintroduce the wrong pattern.
- No behavior change; pure documentation.

## Non-goals

- Do not create `.agent/.sub-rules/**` in this repo — confirmed above as the wrong pattern for this codebase.
- Do not touch `.claude/agents/`, `.claude/commands/`, or `.claude/skills/` — none of the new work needs a custom agent/command/skill; existing `superpowers:*` skills and generic agents suffice.

## File Structure

- Modify: `docs/ai/index.md` — add two bullet entries (firebase_auth, performance) to the topic list, following existing bullet format exactly.
- Create: `docs/ai/firebase-auth.md` — stub with a single "Not yet implemented — see Phase 2b" line; Phase 2b's plan overwrites it with real content as its own task.
- Create: `docs/ai/performance.md` — stub with a single "Not yet implemented — see Phase 2c" line; Phase 2c's plan overwrites it with real content as its own task.
- Create: `/Users/demian-ilnytskyi/.claude/projects/-Volumes-External-own-projects-cloudflare-next-intl/memory/repo_doc_convention.md` — memory file per the `[[reference]]` type, recording `docs/ai/*.md` as this repo's convention.
- Modify: `/Users/demian-ilnytskyi/.claude/projects/-Volumes-External-own-projects-cloudflare-next-intl/memory/MEMORY.md` — one-line index pointer to the new file.

## Out of scope

- Phase 2b and 2c write the *real* content of `firebase-auth.md` / `performance.md` — this phase only stubs them so `index.md`'s links aren't dangling.
