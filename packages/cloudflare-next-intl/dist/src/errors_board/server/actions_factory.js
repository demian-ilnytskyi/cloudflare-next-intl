import { revalidatePath } from 'next/cache.js';
import { parseErrorsListFilters, boundErrorIds, isErrorStatus, listErrors as listErrorsImpl, setErrorsStatus as setErrorsStatusImpl, deleteErrorsByIds as deleteErrorsByIdsImpl, deleteAllResolvedErrors as deleteAllResolvedErrorsImpl, } from './errors_repository.js';
export function createErrorsActions(options) {
    const listErrors = options.repository?.listErrors ?? listErrorsImpl;
    const setErrorsStatus = options.repository?.setErrorsStatus ?? setErrorsStatusImpl;
    const deleteErrorsByIds = options.repository?.deleteErrorsByIds ?? deleteErrorsByIdsImpl;
    const deleteAllResolvedErrors = options.repository?.deleteAllResolvedErrors ?? deleteAllResolvedErrorsImpl;
    const listPath = options.listPath ?? '/errors';
    return {
        async loadErrors(rawParams) {
            await options.requireAccess();
            const filters = parseErrorsListFilters(rawParams);
            const db = await options.getDb();
            return listErrors(db, filters);
        },
        async setErrorStatus(ids, status) {
            await options.requireAccess();
            if (!isErrorStatus(status))
                throw new Error(`errors_board: unknown status "${status}"`);
            const boundedIds = boundErrorIds(ids);
            const db = await options.getDb();
            await setErrorsStatus(db, boundedIds, status);
            revalidatePath(listPath);
        },
        async deleteErrors(ids) {
            await options.requireAccess();
            const boundedIds = boundErrorIds(ids);
            const db = await options.getDb();
            await deleteErrorsByIds(db, boundedIds);
            revalidatePath(listPath);
        },
        async deleteAllResolved() {
            await options.requireAccess();
            const db = await options.getDb();
            await deleteAllResolvedErrors(db);
            revalidatePath(listPath);
        },
    };
}
