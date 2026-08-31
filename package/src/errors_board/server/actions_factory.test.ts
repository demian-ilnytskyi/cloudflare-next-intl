import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from 'next/cache';
import { createErrorsActions } from './actions_factory.js';

describe('createErrorsActions', () => {
    let requireAccess: ReturnType<typeof vi.fn>;
    let db: { marker: string };
    let getDb: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        requireAccess = vi.fn(async () => undefined);
        db = { marker: 'fake-db' };
        getDb = vi.fn(async () => db);
    });

    it('loadErrors calls requireAccess, parses filters, and returns the repository result', async () => {
        const listErrors = vi.fn(async () => ({ rows: [], nextCursor: null }));
        const actions = createErrorsActions({ getDb, requireAccess, repository: { listErrors } as never });

        const result = await actions.loadErrors({ status: 'new', cursor: null });

        expect(requireAccess).toHaveBeenCalledTimes(1);
        expect(listErrors).toHaveBeenCalledWith(db, { flavour: 'all', status: 'new', q: '', cursor: null });
        expect(result).toEqual({ rows: [], nextCursor: null });
    });

    it('setErrorStatus validates ids/status, calls the repository, and revalidates the list path', async () => {
        const setErrorsStatus = vi.fn(async () => undefined);
        const actions = createErrorsActions({ getDb, requireAccess, repository: { setErrorsStatus } as never });

        await actions.setErrorStatus([1, 2], 'resolved');

        expect(setErrorsStatus).toHaveBeenCalledWith(db, [1, 2], 'resolved');
        expect(revalidatePath).toHaveBeenCalledWith('/errors');
    });

    it('setErrorStatus rejects an unknown status before touching the db', async () => {
        const setErrorsStatus = vi.fn();
        const actions = createErrorsActions({ getDb, requireAccess, repository: { setErrorsStatus } as never });

        await expect(actions.setErrorStatus([1], 'bogus')).rejects.toThrow();
        expect(setErrorsStatus).not.toHaveBeenCalled();
    });

    it('deleteErrors validates ids, calls the repository, and revalidates a custom listPath', async () => {
        const deleteErrorsByIds = vi.fn(async () => undefined);
        const actions = createErrorsActions({
            getDb, requireAccess, listPath: '/admin/errors', repository: { deleteErrorsByIds } as never,
        });

        await actions.deleteErrors([5]);

        expect(deleteErrorsByIds).toHaveBeenCalledWith(db, [5]);
        expect(revalidatePath).toHaveBeenCalledWith('/admin/errors');
    });

    it('deleteAllResolved calls the repository and revalidates', async () => {
        const deleteAllResolvedErrors = vi.fn(async () => undefined);
        const actions = createErrorsActions({ getDb, requireAccess, repository: { deleteAllResolvedErrors } as never });

        await actions.deleteAllResolved();

        expect(deleteAllResolvedErrors).toHaveBeenCalledWith(db);
        expect(revalidatePath).toHaveBeenCalledWith('/errors');
    });

    it('every action calls requireAccess before touching the repository', async () => {
        requireAccess = vi.fn(async () => {
            throw new Error('denied');
        });
        const repository = {
            listErrors: vi.fn(),
            setErrorsStatus: vi.fn(),
            deleteErrorsByIds: vi.fn(),
            deleteAllResolvedErrors: vi.fn(),
        };
        const actions = createErrorsActions({ getDb, requireAccess, repository: repository as never });

        await expect(actions.loadErrors({})).rejects.toThrow('denied');
        expect(repository.listErrors).not.toHaveBeenCalled();
    });
});
