'use client';

import { createPortal } from 'react-dom';

/**
 * Renders `children` into `document.body` via a portal, so the default
 * dialogs always stack on top of the host app regardless of its own
 * stacking contexts (a `z-index` alone can't escape an ancestor with
 * `transform`/`filter`/`opacity`/`isolation`, all common in app shells).
 * Only called client-side (both dialogs already gate on `isMounted`), so
 * `document` is always defined here.
 */
export default function DialogPortal({ children }: { children: React.ReactNode }): React.ReactPortal {
    return createPortal(children, document.body);
}
