# `src/cloudflare_email`

Sends a transactional email via the Cloudflare Email Sending binding
(`wrangler.toml`'s `[[send_email]]`) when one is configured, falling back
to the REST endpoint otherwise — the same shape as
`portfolio/src/shared/email/transactional_email.ts`, generalized to resolve
the binding through this package's own `generate.env` convention (works
under Vite too) and to take the verified sender address as a required
option instead of a hardcoded constant.

## Usage

```ts
import { sendTransactionalEmail } from 'cloudflare-next-intl/sendTransactionalEmail';
import intlConfig from './intl_config';

const outcome = await sendTransactionalEmail(
    { to: 'user@example.com', subject: 'Welcome', text: 'Welcome!', html: '<p>Welcome!</p>' },
    { generate: intlConfig.generate, errorHandling: intlConfig.errorHandling, senderAddress: 'no-reply@yourdomain.com' },
    'MyFeature.sendWelcomeEmail',
);
// outcome: 'sent' | 'unavailable' | 'failed' — never throws
```

Local dev (no Worker binding) needs `CLOUDFLARE_ACCOUNT_ID`/
`CLOUDFLARE_EMAIL_TOKEN` in your env (or pass `restAccountId`/`restToken`
directly) to exercise real delivery via the REST fallback; without them,
`sendTransactionalEmail` returns `'unavailable'` rather than attempting a
request that would only fail.

## Layout

- `resolve_email_binding.ts` — resolves the Email Sending binding (default
  name `EMAIL`) via `resolveEnv()`.
- `escape_html.ts` — HTML-escapes a value before it goes into an email body.
- `send_transactional_email.ts` — the binding-or-REST primitive, reporting
  (never throwing) on any failure.
