import type { ErrorStatus } from '../server/errors_repository.js';
export default function ErrorsStatStrip({ counts, activeStatus, linkFor, }: {
    counts: Record<ErrorStatus, number>;
    activeStatus: string;
    linkFor: (status: string) => string;
}): Component;
