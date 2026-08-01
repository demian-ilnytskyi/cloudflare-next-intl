# Supabase Edge Functions (Deno + TS)

- Default to **anon key + user JWT** so RLS protects data.
- Service role only when bypassing RLS is intentional and documented.
- Validate body with zod. Return CORS headers on every response and on
  `OPTIONS`.
- Secrets via `supabase secrets set` + `Deno.env.get`.

## Error handling

Same shape as Firebase Functions:

1. `console.error(error)` the original error.
2. Return:

```ts
return {
  formatted_error: 'Failed to do something. Please try again.',
  original_error: serializeError(error),
};
```

- `formatted_error` — user-friendly sentence shown to the end user.
- `original_error` — original error via `serializeError(...)` for logs only.
