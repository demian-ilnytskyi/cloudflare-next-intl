export default function encodeParam(value) {
    if (value === null || value === undefined)
        return 'NULL';
    if (typeof value === 'boolean')
        return value ? 'true' : 'false';
    if (typeof value === 'number') {
        if (Number.isNaN(value))
            return "'NaN'";
        if (value === Infinity)
            return "'Infinity'";
        if (value === -Infinity)
            return "'-Infinity'";
        return String(value);
    }
    if (typeof value === 'bigint')
        return value.toString();
    if (value instanceof Date)
        return quoteLiteral(value.toISOString());
    if (value instanceof Uint8Array)
        return quoteLiteral(`\\x${bytesToHex(value)}`);
    if (Array.isArray(value))
        return quoteLiteral(encodeArray(value));
    if (typeof value === 'string')
        return quoteLiteral(value);
    return quoteLiteral(JSON.stringify(value));
}
const HEX_TABLE = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));
function quoteLiteral(text) {
    if (text.indexOf("'") === -1)
        return `'${text}'`;
    return `'${text.replace(/'/g, "''")}'`;
}
function bytesToHex(bytes) {
    let hex = '';
    const len = bytes.length;
    for (let i = 0; i < len; i++) {
        hex += HEX_TABLE[bytes[i]];
    }
    return hex;
}
function encodeArray(value) {
    const items = value.map((item) => {
        if (item === null || item === undefined)
            return 'NULL';
        if (Array.isArray(item))
            return encodeArray(item);
        if (item instanceof Date)
            return quoteArrayElement(item.toISOString());
        if (typeof item === 'number' || typeof item === 'bigint' || typeof item === 'boolean')
            return String(item);
        return quoteArrayElement(typeof item === 'string' ? item : JSON.stringify(item));
    });
    return `{${items.join(',')}}`;
}
function quoteArrayElement(text) {
    if (text.indexOf('\\') === -1 && text.indexOf('"') === -1)
        return `"${text}"`;
    return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
