---
description: Deploy a Supabase Edge Function. Usage: /deploy-supabase-fn <functionName>
---

Steps:

1. Verify file exists: `supabase/functions/<name>/index.ts`.
2. Type-check with Deno: `rtk deno check supabase/functions/<name>/index.ts`.
3. Deploy: `rtk supabase functions deploy <name>`.
4. Tail logs: `rtk supabase functions logs <name>`.

Only set `--no-verify-jwt` if the function is intentionally public (webhook from a trusted source verifying its own signature).
