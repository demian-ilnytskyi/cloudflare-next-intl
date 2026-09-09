export declare function useMounted(): boolean;
export declare function LocalTime({ format, timestampMs }: {
    format: (timestampMs: number) => string;
    timestampMs: number;
}): Component;
export declare function CopyButton({ text, label, copiedLabel, }: {
    text: string;
    label?: string;
    copiedLabel?: string;
}): Component;
export declare function DetailBlock({ label, text }: {
    label: string;
    text: string;
}): Component;
