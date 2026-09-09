/**
 * Serialises a JS value to a Postgres literal, mirroring how `pg` sends
 * values over the wire so an inlined literal type-infers the same way a
 * bound parameter would.
 *
 * Used to substitute `$n` placeholders client-side in Supabase mode, where
 * `cfni_exec` takes a single already-complete statement — see
 * {@link inlineParams}.
 */
export default function encodeParam(value: unknown): string {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') {
        if (Number.isNaN(value)) return "'NaN'";
        if (value === Infinity) return "'Infinity'";
        if (value === -Infinity) return "'-Infinity'";
        return String(value);
    }
    if (typeof value === 'bigint') return value.toString();
    if (value instanceof Date) return quoteLiteral(value.toISOString());
    if (value instanceof Uint8Array) return quoteLiteral(`\\x${bytesToHex(value)}`);
    if (Array.isArray(value)) return quoteLiteral(encodeArray(value));
    if (typeof value === 'string') return quoteLiteral(value);
    // Plain objects (jsonb columns) — pg sends these JSON-stringified.
    return quoteLiteral(JSON.stringify(value));
}

const HEX_TABLE = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

function quoteLiteral(text: string): string {
    if (text.indexOf("'") === -1) return `'${text}'`;
    return `'${text.replace(/'/g, "''")}'`;
}

function bytesToHex(bytes: Uint8Array): string {
    let hex = '';
    const len = bytes.length;
    for (let i = 0; i < len; i++) {
        hex += HEX_TABLE[bytes[i]!];
    }
    return hex;
}

/** Encodes a JS array as a Postgres array literal body, e.g. `{1,2,"a,b"}`. */
function encodeArray(value: unknown[]): string {
    const items = value.map((item) => {
        if (item === null || item === undefined) return 'NULL';
        if (Array.isArray(item)) return encodeArray(item);
        if (item instanceof Date) return quoteArrayElement(item.toISOString());
        if (typeof item === 'number' || typeof item === 'bigint' || typeof item === 'boolean') return String(item);
        return quoteArrayElement(typeof item === 'string' ? item : JSON.stringify(item));
    });
    return `{${items.join(',')}}`;
}

function quoteArrayElement(text: string): string {
    if (text.indexOf('\\') === -1 && text.indexOf('"') === -1) return `"${text}"`;
    return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
