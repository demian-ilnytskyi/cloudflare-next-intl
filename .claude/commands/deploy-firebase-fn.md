---
description: Build and deploy a single Firebase Cloud Function. Usage: /deploy-firebase-fn <functionName>
---

Steps:

1. `cd functions && rtk npm run build`
2. Confirm the function name compiled (grep `exports.<name>` in `lib/`).
3. Deploy: `rtk firebase deploy --only functions:<name>`
4. Tail logs: `rtk firebase functions:log --only <name> --lines 50`

Never run `firebase deploy` without the `--only` filter.
