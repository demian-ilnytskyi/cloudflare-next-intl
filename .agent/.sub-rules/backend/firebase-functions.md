# Firebase Cloud Functions (TS, v2)

- Always set `region`, `memory`, `timeoutSeconds`, `maxInstances`.
- Validate input with zod. Reject unknown fields.
- Secrets via `defineSecret`. Never `process.env` for credentials.
- Idempotency on event triggers — guard on `eventId`.
- Deploy with `--only functions:<name>`. Never bulk-deploy.
- **Firestore reads must be minimal.** Read only the documents the function
  actually needs (use specific doc IDs / narrow `where` queries, not full
  collection scans) and project to only the fields you'll use when the SDK
  supports it. Never load a whole collection to filter in memory.

## Error handling

Every `catch` block must:

1. `console.error(error)` the original error.
2. Return a structured payload:

```ts
return {
  formatted_error: 'Failed to do something. Please try again.',
  original_error: serializeError(error),
};
```

- `formatted_error` — short, user-friendly sentence shown directly to the
  end user. Must read naturally; no stack traces, no internal IDs.
- `original_error` — original error through `serializeError(...)` so it
  survives JSON transport. For logs / debugging only.
