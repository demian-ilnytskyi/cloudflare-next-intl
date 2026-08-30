export default function setCookie({ name, value, maxAge }: {
    name: string;
    value: string | number | boolean;
    maxAge?: number;
}): void;
