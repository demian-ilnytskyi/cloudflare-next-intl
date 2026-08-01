# Phase 4: AI-Friendliness Investigation — Design

## Context

Final phase of the project (after Phase 1 test coverage, Phase 2b
`firebase_auth` module, Phase 2c performance suite). This phase is an
**investigation only** — it produces a report/recommendations doc, not code
changes. Goal: figure out what makes `cloudflare-next-intl` easy or hard for
an AI coding agent to use correctly without deep prior knowledge of the
package — i.e. an agent should be able to look at one method/type and infer
correct usage without trial-and-error against `dist/`, README examples, or
this repo's own `.agent/.sub-rules/packages/**` notes (which document the
package's *internals* for maintainers, not its *public API* for consumers).

## Goals

- Produce `docs/superpowers/specs/2026-08-01-phase5-ai-friendliness-plan.md`
  (or equivalent) — NOT code. This phase's own deliverable is investigation
  + a scored list of concrete, actionable improvements a later phase could
  implement.
- Evaluate the package's public surface (everything in `package.json`'s
  `exports` map, plus the new `firebaseAuth*` subpaths from Phase 2b)
  against a concrete AI-usability rubric (below), file by file.
- Identify specific gaps: missing/thin JSDoc on exported functions and
  types, ambiguous parameter names, undocumented invariants (e.g. "at most
  one of rewriteUrl/redirectUrl is set") that only exist as prose in
  `types.ts` today rather than being inferable from the type signature
  itself, error messages that don't tell an agent what to fix, and any
  places where correct usage requires reading source rather than the type
  signature + doc comment.
- Recommend concrete mechanisms (not just "add more comments"): e.g.
  JSDoc `@example` blocks on every exported function, stricter/narrower
  types replacing `any`/loose `string` params (e.g. `ReturnType = any` in
  `types.ts`), runtime validation with actionable error messages,
  a machine-readable capability manifest, `llms.txt`, or exposing the
  `.agent/.sub-rules/packages/**` notes (or a curated subset) as part of the
  published package itself so a consumer's own AI agent can read them.

## AI-usability rubric (what "investigate" means concretely)

For each exported function/type/component, score against:

1. **Signature self-sufficiency** — can an agent call this correctly from
   the type signature + JSDoc alone, with zero source-reading? (e.g.
   `MiddlewareCustomHandler`'s "at most one of rewriteUrl/redirectUrl"
   invariant is currently prose in a doc comment, not encoded in the type
   — a discriminated union would make it unrepresentable to get wrong.)
2. **Error actionability** — when misused, does the runtime error name the
   exact wrong value and the exact fix? (e.g. `@intl-config` unresolved
   throws a generic `Please set config file...` — does it say *where* to
   put it, or point at the README section?)
3. **Example coverage** — does every exported subpath have at least one
   realistic usage example reachable from the type itself (`@example` tag)
   or from a doc an agent is likely to load automatically (README,
   package-level doc comment)?
4. **Naming consistency** — do parallel APIs (e.g. the two
   `useLocale`/`useTranslations` implementations) use identical parameter
   names/order/return shapes so an agent generalizing from one gets the
   other right too?
5. **Discoverability without a build step** — can an agent reading only
   `package.json`'s `exports` map (no need to open `dist/` or `src/`)
   understand what's available and where the types live?

## Investigation Method

- Read every file `package.json`'s `exports` map points to (plus
  `firebaseAuth*` subpaths once Phase 2b lands), scoring each against the
  rubric above.
- Cross-check against `.agent/.sub-rules/packages/**` — anything documented
  there as a "gotcha" or "don't do X" is a signal that the *type system or
  API shape itself* failed to prevent the mistake; each such note is a
  candidate for a rubric-1 (signature self-sufficiency) fix.
- Survey how comparable, widely-AI-adopted packages solve this (e.g. how
  `next-intl` itself, or `zod`, documents/types its API for LLM
  consumption) — informational only, not a mandate to copy their API shape.
- Check whether an `llms.txt` (or similar machine-readable summary,
  emerging convention for AI-consumable docs) is worth adding, and what
  it would need to contain to be non-redundant with the README/JSDoc.

## Structure review (folder/module layout, not just individual APIs)

A confusing folder layout costs an agent just as much as a bad type
signature — it has to grep around to find the right file before it can even
read the signature. Review, using `.agent/.sub-rules/packages/structure.md`
as the current source of truth for the actual layout:

- **Predictability of file location from subpath name.** For every
  `package.json` exports entry, check whether an agent could guess the
  source file path from the subpath name alone (e.g. does `./LocaleLink`
  obviously live under `client/components/`, or does the agent need to grep?).
  Flag subpaths whose folder placement doesn't match their name's implied
  runtime (e.g. anything server-only nested under a folder named `general`).
- **One-concept-per-file consistency.** Confirm the existing convention (one
  exported thing per file, matching the subpath) holds for every file, and
  flag any file bundling multiple unrelated exports under one path — that
  forces an agent to read past irrelevant code to find what it needs.
- **Barrel files vs. real subpaths.** `src/**/index.ts` barrels are
  excluded from coverage and mostly not what `exports` points at (see
  `package-exports` notes in `package-authoring.md`) — evaluate whether
  keeping barrels around that don't match the public surface is confusing
  for an agent that greps `index.ts` first out of habit, vs. deleting them
  or making them accurately mirror `exports`.
- **Depth and naming of the `firebase_auth` module** (once Phase 2b lands)
  as a test case for whether the "isolated optional submodule" pattern
  itself reads clearly to an agent unfamiliar with the codebase — does its
  internal `client/`/`server/`/`middleware/`/`error_messages/` split mirror
  the top-level package's own split closely enough to be inferable by
  analogy, or does it need its own explicit structure doc regardless?
- **Config-resolution indirection** (`@intl-config`/`@locale-file` path
  aliases) — this is the single biggest structural "you must already know
  this" gotcha in the package today (a bare import that throws at module
  load time if unset, documented only in prose). Evaluate whether the
  *directory structure* itself could make this more discoverable (e.g. a
  `src/config/README.md` co-located right next to `intl_config.ts`, so an
  agent opening that folder sees the requirement before writing any code
  that imports from it) independent of any type-level fix already covered
  under the API rubric above.

## Deliverable

A single new spec/plan document (this phase's actual output) containing:
- The per-file rubric scoring (table or per-file notes).
- A structure-review section: current layout's strengths/weaknesses per the
  points above, with a proposed folder/naming layout only if the review
  finds the current one genuinely hurts agent navigation — not a reorg for
  its own sake.
- A prioritized, concrete list of proposed changes — each tagged with
  whether it's a type-level fix (compile-time preventable misuse), a
  doc/JSDoc fix (zero runtime cost), an error-message fix, a structural/
  folder-layout fix, or a new artifact (llms.txt, exposed docs). Flagged to
  the user for approval before any implementation phase is written or executed.

## Non-goals

- No code changes in this phase. No new tests. No package.json changes.
- Not a general "improve DX" pass — scoped specifically to AI-agent
  usability (an agent operating without a human iterating in a REPL),
  distinct from human-DX concerns like editor autocomplete quality (though
  the two often overlap).
- Does not presuppose the outcome — if the investigation concludes the
  package is already sufficiently AI-friendly, that's a valid finding; the
  deliverable can recommend "no action" for a given file.
