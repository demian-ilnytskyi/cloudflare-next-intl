---
name: typescript-strict
description: Strict TypeScript conventions for Firebase Functions and Supabase Edge Functions. Zod-first validation, discriminated unions, no any.
---

# TypeScript (Strict)

## tsconfig baseline
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

## Validation pattern
```ts
import { z } from "zod";

export const NoteSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
  body: z.string().optional(),
});
export type Note = z.infer<typeof NoteSchema>;
```

## Discriminated unions for results
```ts
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```

## Anti-patterns
- `as` casts past unknown — narrow with predicates or zod instead.
- `any` anywhere — replace with `unknown` and narrow.
- Default exports in libraries — explicit named exports only.
- `enum` — prefer `const` object + `as const` + union type.

## Errors
- Throw `HttpsError` (Firebase) or return typed Response (Supabase Deno).
- Never leak stack traces to clients. Log full error server-side, return a sanitized message.
