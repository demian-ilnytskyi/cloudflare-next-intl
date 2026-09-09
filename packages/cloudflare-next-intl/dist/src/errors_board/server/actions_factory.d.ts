import { type D1DatabaseLike, type ErrorsListResult, listErrors as listErrorsImpl, setErrorsStatus as setErrorsStatusImpl, deleteErrorsByIds as deleteErrorsByIdsImpl, deleteAllResolvedErrors as deleteAllResolvedErrorsImpl } from './errors_repository.js';
export interface ErrorsActions {
    loadErrors(rawParams: {
        flavour?: string;
        status?: string;
        q?: string;
        cursor?: string | null;
    }): Promise<ErrorsListResult>;
    setErrorStatus(ids: number[], status: string): Promise<void>;
    deleteErrors(ids: number[]): Promise<void>;
    deleteAllResolved(): Promise<void>;
}
export interface ErrorsActionsOptions {
    getDb: () => Promise<D1DatabaseLike> | D1DatabaseLike;
    requireAccess: () => Promise<void>;
    listPath?: string;
    repository?: {
        listErrors?: typeof listErrorsImpl;
        setErrorsStatus?: typeof setErrorsStatusImpl;
        deleteErrorsByIds?: typeof deleteErrorsByIdsImpl;
        deleteAllResolvedErrors?: typeof deleteAllResolvedErrorsImpl;
    };
}
export declare function createErrorsActions(options: ErrorsActionsOptions): ErrorsActions;
