---
description: Type-check and lint all TypeScript packages (Firebase Functions + shared TS).
---

Run from the relevant package root:

```bash
rtk tsc --noEmit
rtk lint
```

For Supabase Edge Functions (Deno):

```bash
rtk deno check supabase/functions/**/*.ts
rtk deno lint supabase/functions
```

Report failures grouped by file/code. No success spam.
