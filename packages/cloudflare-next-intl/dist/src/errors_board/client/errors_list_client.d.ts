import type { ErrorRow } from '../server/errors_repository.js';
import type { ErrorsActions } from '../server/actions_factory.js';
interface Filters {
    flavour: string;
    status: string;
    q: string;
}
export default function ErrorsListClient({ initialRows, initialNextCursor, filters, actions, hrefFor, }: {
    initialRows: ErrorRow[];
    initialNextCursor: string | null;
    filters: Filters;
    actions: ErrorsActions;
    hrefFor: (id: number) => string;
}): Component;
export {};
