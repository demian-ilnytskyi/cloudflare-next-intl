import type { ErrorRow } from '../server/errors_repository.js';
export default function ErrorRowItem({ row, selected, onToggleSelect, hrefFor, }: {
    row: ErrorRow;
    selected: boolean;
    onToggleSelect: (id: number, checked: boolean) => void;
    hrefFor: (id: number) => string;
}): Component;
