# `src/errors_board`

A customizable, D1-backed error log: a filterable/searchable list with bulk
status actions, and a detail view per error. Ported from
`clarivant/CRV`'s `/errors` feature. **Next-only** (uses `next/navigation`,
`next/cache`, `next/link`) — see `../cloudflare_fetch` if you need
something Vite-compatible instead.

Nothing here is a page — App Router pages must be real files under your
own `app/` directory, so you write a handful of thin wiring files that
import these pieces. Everything below is copy-paste-able.

## 1. Gate (`app/errors/gate.ts`)

```ts
import { createRequireErrorsAccess } from 'cloudflare-next-intl/errorsBoard';

export const requireErrorsAccess = createRequireErrorsAccess({
    allowedEmails: ['tester_1@codinghouse.biz', 'tester_2@codinghouse.biz'],
    // Or, for a domain-wide allowlist instead of a fixed list:
    // allowedEmails: (email) => email?.endsWith('@codinghouse.biz') ?? false,
});
```

## 2. Actions (`app/errors/actions.ts`)

```ts
'use server';

import { env } from 'cloudflare:workers'; // or however your app resolves bindings
import { createErrorsActions } from 'cloudflare-next-intl/errorsBoard';
import { requireErrorsAccess } from './gate';

export const { loadErrors, setErrorStatus, deleteErrors, deleteAllResolved } = createErrorsActions({
    getDb: () => {
        const db = env?.ERRORS_DB;
        if (!db) throw new Error('ERRORS_DB binding is not available');
        return db;
    },
    requireAccess: requireErrorsAccess,
});
```

## 3. List page (`app/errors/page.tsx`)

```tsx
import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { requireErrorsAccess } from './gate';
import { loadErrorsBoard, parseErrorsListFilters } from 'cloudflare-next-intl/errorsBoard';
import ErrorsStatStrip from 'cloudflare-next-intl/ErrorsStatStrip';
import ErrorsFilterForm from 'cloudflare-next-intl/ErrorsFilterForm';
import ErrorsListClient from 'cloudflare-next-intl/ErrorsListClient';
import * as actions from './actions';

export const dynamic = 'force-dynamic';

export default async function ErrorsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
    await requireErrorsAccess();
    const filters = parseErrorsListFilters(await searchParams);
    const db = env.ERRORS_DB;
    const board = await loadErrorsBoard(db, filters);

    function linkFor(status: string): string {
        return `/errors?${new URLSearchParams({ flavour: filters.flavour, status, q: filters.q })}`;
    }

    return (
        <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-5 px-4 py-8">
            <h1 className="text-2xl font-semibold">Error log</h1>
            <ErrorsStatStrip counts={board.counts} activeStatus={filters.status} linkFor={linkFor} />
            <ErrorsFilterForm flavours={board.flavours} filters={filters} />
            <ErrorsListClient
                initialRows={board.rows}
                initialNextCursor={board.nextCursor}
                filters={filters}
                actions={actions}
                hrefFor={(id) => `/errors/${id}`}
            />
        </main>
    );
}
```

## 4. Detail page (`app/errors/[id]/page.tsx`)

```tsx
import { notFound } from 'next/navigation';
import { env } from 'cloudflare:workers';
import { requireErrorsAccess } from '../gate';
import { getErrorById } from 'cloudflare-next-intl/errorsBoard';
import ErrorDetailView from 'cloudflare-next-intl/ErrorDetailView';
import * as actions from '../actions';

export default async function ErrorDetailPage({ params }: { params: Promise<{ id: string }> }) {
    await requireErrorsAccess();
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) notFound();

    const row = await getErrorById(env.ERRORS_DB, id);
    if (!row) notFound();

    return <ErrorDetailView row={row} actions={actions} onDeleted={() => (window.location.href = '/errors')} />;
}
```

## 5. Writing errors into it

`recordError` (from `cloudflare-next-intl/errorsBoard`) is the write side —
wire it as your `errorHandling.onError` in `intl_config.ts`, alongside
`cloudflare-next-intl/createServerErrorAction`'s `requestContext`:

```ts
import { recordError } from 'cloudflare-next-intl/errorsBoard';

async function onError(params) {
    const db = /* resolve env.ERRORS_DB same as getDb() above */;
    await recordError(db, {
        flavour: process.env.APP_FLAVOUR ?? 'local',
        caller: params.classOrMethodName,
        message: params.error instanceof Error ? params.error.message : String(params.error),
        stack: params.error instanceof Error ? params.error.stack ?? null : null,
        params: params.params ? JSON.stringify(params.params) : null,
        isClient: params.isClient === true,
        userEmail: /* your own signed-in-user lookup, or null */,
    });
}
```

## Layout

- `server/errors_repository.ts` — D1 schema + CRUD; no `@cloudflare/workers-types`
  dependency (a local `D1DatabaseLike` duck type).
- `server/gate.ts` — `createRequireErrorsAccess`, built on this package's
  own `getFirebaseAuthUser`.
- `server/actions_factory.ts` — `createErrorsActions`, the four server
  actions the client components call.
- `shared/error_ui_helpers.ts` — status labels/colors, relative/local time
  formatting (native `Intl`, no `luxon`), request-context parsing.
- `client/*.tsx` — the five components above, each taking its data and
  action functions as props rather than importing anything by a fixed
  path, so the whole board can be mounted at any route.
