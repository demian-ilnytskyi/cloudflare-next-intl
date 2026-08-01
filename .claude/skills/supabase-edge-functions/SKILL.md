---
name: supabase-edge-functions
description: Patterns for Supabase Edge Functions (Deno + TypeScript). Auth-aware Postgres access, CORS, secrets, and webhook handling.
---

# Supabase Edge Functions

## Skeleton
```ts
// supabase/functions/<name>/index.ts
import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3";

const Body = z.object({ id: z.string().uuid() });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return json({ error: "bad input" }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
  );
  // RLS now applies as the calling user.
  const { data, error } = await supabase.from("notes").select("*").eq("id", parsed.data.id);
  if (error) return json({ error: error.message }, 500);
  return json({ data });
});

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" }});
```

## Service-role escape hatch
Only when you must bypass RLS (admin tasks, webhooks). Initialize a second client with `SUPABASE_SERVICE_ROLE_KEY` and document why in a comment.

## Secrets
- `supabase secrets set FOO=bar` — never commit `.env` files.
- Read with `Deno.env.get("FOO")`.

## Webhooks
Verify signatures (HMAC) before trusting the body. Use `--no-verify-jwt` only for these and only after signature check passes.
