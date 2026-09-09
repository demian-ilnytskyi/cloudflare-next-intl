import type { ErrorRow } from '../server/errors_repository.js';
import type { ErrorsActions } from '../server/actions_factory.js';
export default function ErrorDetailView({ row, actions, onDeleted, }: {
    row: ErrorRow;
    actions: ErrorsActions;
    onDeleted: () => void;
}): Component;
