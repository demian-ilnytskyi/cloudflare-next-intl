---
description: Produce an implementation plan for a stack-aware change. No code is written — only the plan.
---

# /plan — clarivant

Goal: turn a feature request into a layer-by-layer plan an agent can execute.

## Output sections (required)

### 1. Scope

- What's in / out of scope, in one paragraph.
- User-visible behavior change.

### 2. Layer breakdown

List the layers touched and the changes per layer:

- **Flutter** — widgets, Cubits/Blocs, repositories, models
- **Firebase Functions** — new/modified functions, triggers, validation
- **Supabase Edge** — endpoints, auth model (anon+JWT vs service role)
- **Postgres** — new tables, columns, constraints, indexes, RLS policies
- **Shared types** — TS contracts, Dart models, codegen

### 3. Data model

- New/modified tables with columns and constraints.
- RLS policy for each new table (explicit per operation).
- Migration file name(s).

### 4. API surface

- For each endpoint: method, path/name, input schema (zod), output schema, auth
  requirements.

### 5. Test plan

- Unit tests to add (bloc_test, vitest, deno test, RLS SQL checks).
- Manual verification steps for the Flutter UI.

### 6. Risk + rollback

- What breaks if this ships wrong.
- How to roll back each layer (see workflows/deploy.md).

### 7. Step order

Numbered sequence of commits. Always:

1. Postgres migration (with RLS) first.
2. Backend functions next.
3. Flutter wiring last. Each step independently testable.

## Don't

- Don't write production code in plan mode.
- Don't expand scope beyond the request.
- Don't pick architectural changes without flagging the tradeoff.
