# Global Rules — clarivant

Stack: Flutter, Firebase Functions (TS/Node), Supabase Edge Functions (TS/Deno),
Postgres, Python.

## Context Management

- /compact aggressively when context grows long
- /clear between unrelated tasks
- Never re-read files already in context

## Code Discovery

- Read only the symbols strictly needed

## Conventions

- Targeted edits ONLY (no full file rewrites).
- CI/CD must pass before deploy/test.
- NEVER log PII/secrets or commit `.env`.
- Tests required for new domain logic.

## Active MCP Servers

- `dart-mcp-server` — Flutter/Dart analysis
- `memory` — cross-session recall
- `fetchv2` — URL fetching
- `azure_devops` — PR/work item management

## Layer Rules (lazy — read only the file for the layer you're touching)

**Why lazy:** these files are NOT auto-loaded. You MUST open the relevant index
before writing/editing code in that layer — the rules contain non-obvious
project conventions (DI, freezed state, RPC-only access, error helpers, RLS)
that you will violate if you skip them. Open the index, then drill into the
specific leaf file for the change.

- **Flutter** (any `.dart` file — widgets, blocs/cubits, pages, models, UI,
  forms, lists) → read `.agent/.sub-rules/frontend/flutter.md` first. Index
  points to: architecture, bloc, layering, models, no-utils, page, ui-sizing,
  ui-widgets, async-errors.
- **Backend** (any Postgres migration/RPC, Firebase Function, Supabase Edge
  Function, TS, or Python script) → read `.agent/.sub-rules/backend.md` first.
  Index points to: postgres (schema/rpc/perf), firebase-functions,
  supabase-edge, plus TS + Python conventions inline.
- **RTK CLI** (token-saving command reference) → `.agent/.sub-rules/rtk.md`.

## Memory

`memory/MEMORY.md`: Read at session start. Proactively save non-obvious facts,
user prefs, and data schemas here. Update existing files. **Also update memory
whenever you learn something new about a part of the project** — architecture
decisions, module boundaries, naming conventions, gotchas, recurring patterns,
ownership of features, or anything that would help future sessions understand
this codebase faster.

## Scripts

`scripts/`: Contains project automation scripts that AI or tooling runs directly
— e.g. codegen, data migration, audit/verify, schema checks. Check this folder
before writing a one-off script; a suitable one may already exist.

## Local DB

Use `supabase/scripts/db_start.sh` to run/start local Supabase DB.
