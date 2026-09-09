export default function ErrorsFilterForm({ flavours, filters, }: {
    flavours: string[];
    filters: {
        flavour: string;
        status: string;
        q: string;
    };
}): Component;
