import { revalidatePath } from 'next/cache';
import {
    type D1DatabaseLike,
    type ErrorsListResult,
    parseErrorsListFilters,
    boundErrorIds,
    isErrorStatus,
    listErrors as listErrorsImpl,
    setErrorsStatus as setErrorsStatusImpl,
    deleteErrorsByIds as deleteErrorsByIdsImpl,
    deleteAllResolvedErrors as deleteAllResolvedErrorsImpl,
} from './errors_repository.js';

export interface ErrorsActions {
    loadErrors(rawParams: { flavour?: string; status?: string; q?: string; cursor?: string | null }): Promise<ErrorsListResult>;
    setErrorStatus(ids: number[], status: string): Promise<void>;
    deleteErrors(ids: number[]): Promise<void>;
    deleteAllResolved(): Promise<void>;
}

export interface ErrorsActionsOptions {
    /** Resolves the D1 database for the current request — e.g. `() => env.ERRORS_DB` via your own `generate.env`. */
    getDb: () => Promise<D1DatabaseLike> | D1DatabaseLike;
    /** Your `createRequireErrorsAccess(...)` result, or any other `() => Promise<void>` guard that throws/redirects on denial. */
    requireAccess: () => Promise<void>;
    /** Path passed to `revalidatePath` after a mutation. Defaults to `/errors`. */
    listPath?: string;
    /** Injection point for tests only — defaults to the real repository functions. */
    repository?: {
        listErrors?: typeof listErrorsImpl;
        setErrorsStatus?: typeof setErrorsStatusImpl;
        deleteErrorsByIds?: typeof deleteErrorsByIdsImpl;
        deleteAllResolvedErrors?: typeof deleteAllResolvedErrorsImpl;
    };
}

/**
 * Builds the four server actions the `errors_board` client components need.
 * Re-export the result from your own `"use server"` file (same constraint
 * as `createServerErrorAction` — Next requires every top-level export of a
 * `"use server"` file to itself be declared async, so the factory call
 * must live in a plain module and the `"use server"` directive in the file
 * that imports and re-exports its result).
 */
export function createErrorsActions(options: ErrorsActionsOptions): ErrorsActions {
    const listErrors = options.repository?.listErrors ?? listErrorsImpl;
    const setErrorsStatus = options.repository?.setErrorsStatus ?? setErrorsStatusImpl;
    const deleteErrorsByIds = options.repository?.deleteErrorsByIds ?? deleteErrorsByIdsImpl;
    const deleteAllResolvedErrors = options.repository?.deleteAllResolvedErrors ?? deleteAllResolvedErrorsImpl;
    const listPath = options.listPath ?? '/errors';

    return {
        async loadErrors(rawParams): Promise<ErrorsListResult> {
            await options.requireAccess();
            const filters = parseErrorsListFilters(rawParams);
            const db = await options.getDb();
            return listErrors(db, filters);
        },

        async setErrorStatus(ids, status): Promise<void> {
            await options.requireAccess();
            if (!isErrorStatus(status)) throw new Error(`errors_board: unknown status "${status}"`);
            const boundedIds = boundErrorIds(ids);
            const db = await options.getDb();
            await setErrorsStatus(db, boundedIds, status);
            revalidatePath(listPath);
        },

        async deleteErrors(ids): Promise<void> {
            await options.requireAccess();
            const boundedIds = boundErrorIds(ids);
            const db = await options.getDb();
            await deleteErrorsByIds(db, boundedIds);
            revalidatePath(listPath);
        },

        async deleteAllResolved(): Promise<void> {
            await options.requireAccess();
            const db = await options.getDb();
            await deleteAllResolvedErrors(db);
            revalidatePath(listPath);
        },
    };
}
