---
name: firebase-functions
description: Patterns for Firebase Cloud Functions v2 in TypeScript. Trigger selection, input validation, idempotency, secrets, and deployment.
---

# Firebase Functions

## Trigger choice
- HTTPS callable (`onCall`) — preferred from Flutter app; auth context auto-attached.
- HTTPS request (`onRequest`) — only for webhooks from external systems.
- Firestore (`onDocumentWritten`) — reactive workflows.
- Scheduler (`onSchedule`) — cron-like jobs.
- Pub/Sub — fan-out, decoupled work.

## Required config on every function
```ts
export const myFn = onCall(
  { region: "europe-west1", memory: "256MiB", timeoutSeconds: 30, maxInstances: 10 },
  async (req) => { /* ... */ }
);
```

## Validation
```ts
import { z } from "zod";
const Input = z.object({ id: z.string().uuid(), count: z.number().int().positive() });
const parsed = Input.safeParse(req.data);
if (!parsed.success) throw new HttpsError("invalid-argument", "bad input");
```

## Idempotency
For Firestore triggers, store `eventId` in a `processed_events` collection (TTL’d) before doing side effects. Skip if seen.

## Secrets
```ts
import { defineSecret } from "firebase-functions/params";
const STRIPE_KEY = defineSecret("STRIPE_KEY");
export const charge = onCall({ secrets: [STRIPE_KEY] }, async (req) => {
  const key = STRIPE_KEY.value();
});
```

## Local dev
- `firebase emulators:start --only functions,firestore,auth`
- Point Flutter app at emulator with `FirebaseFunctions.instanceFor(region: ...).useFunctionsEmulator("localhost", 5001);`
