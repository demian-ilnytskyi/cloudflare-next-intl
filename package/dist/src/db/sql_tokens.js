const TOKEN_CACHE = new Map();
const MAX_CACHE_SIZE = 500;
export default function tokenizeSql(sql) {
    const cached = TOKEN_CACHE.get(sql);
    if (cached)
        return cached.slice();
    const tokens = [];
    let i = 0;
    const len = sql.length;
    while (i < len) {
        const code = sql.charCodeAt(i);
        if (code === 32 || (code >= 9 && code <= 13)) {
            i++;
            continue;
        }
        if (code === 45 && sql.charCodeAt(i + 1) === 45) {
            const end = sql.indexOf('\n', i);
            i = end === -1 ? len : end + 1;
            continue;
        }
        if (code === 47 && sql.charCodeAt(i + 1) === 42) {
            const end = sql.indexOf('*/', i + 2);
            i = end === -1 ? len : end + 2;
            continue;
        }
        if (code === 34) {
            const [value, next] = readDelimited(sql, i + 1, '"');
            tokens.push({ kind: 'quoted', value });
            i = next;
            continue;
        }
        if (code === 39) {
            const [value, next] = readDelimited(sql, i + 1, "'");
            tokens.push({ kind: 'string', value });
            i = next;
            continue;
        }
        if (code === 36) {
            const nextCode = sql.charCodeAt(i + 1);
            if (nextCode >= 48 && nextCode <= 57) {
                let end = i + 2;
                while (end < len) {
                    const c = sql.charCodeAt(end);
                    if (c >= 48 && c <= 57)
                        end++;
                    else
                        break;
                }
                tokens.push({ kind: 'param', index: Number(sql.slice(i + 1, end)) });
                i = end;
                continue;
            }
        }
        if (code >= 48 && code <= 57) {
            let end = i + 1;
            while (end < len) {
                const c = sql.charCodeAt(end);
                if ((c >= 48 && c <= 57) || c === 46)
                    end++;
                else
                    break;
            }
            tokens.push({ kind: 'number', value: sql.slice(i, end) });
            i = end;
            continue;
        }
        if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95) {
            let end = i + 1;
            while (end < len) {
                const c = sql.charCodeAt(end);
                if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 95)
                    end++;
                else
                    break;
            }
            tokens.push({ kind: 'word', value: sql.slice(i, end).toLowerCase() });
            i = end;
            continue;
        }
        const nextCode = sql.charCodeAt(i + 1);
        if (nextCode) {
            if (code === 45 && nextCode === 124 && sql.charCodeAt(i + 2) === 45) {
                tokens.push({ kind: 'punct', value: '-|-' });
                i += 3;
                continue;
            }
            if (code === 60 && nextCode === 62) {
                tokens.push({ kind: 'punct', value: '<>' });
                i += 2;
                continue;
            }
            if (code === 33 && nextCode === 61) {
                tokens.push({ kind: 'punct', value: '!=' });
                i += 2;
                continue;
            }
            if (code === 62 && nextCode === 61) {
                tokens.push({ kind: 'punct', value: '>=' });
                i += 2;
                continue;
            }
            if (code === 60 && nextCode === 61) {
                tokens.push({ kind: 'punct', value: '<=' });
                i += 2;
                continue;
            }
            if (code === 126 && nextCode === 42) {
                tokens.push({ kind: 'punct', value: '~*' });
                i += 2;
                continue;
            }
            if (code === 64 && nextCode === 62) {
                tokens.push({ kind: 'punct', value: '@>' });
                i += 2;
                continue;
            }
            if (code === 60 && nextCode === 64) {
                tokens.push({ kind: 'punct', value: '<@' });
                i += 2;
                continue;
            }
            if (code === 38 && nextCode === 38) {
                tokens.push({ kind: 'punct', value: '&&' });
                i += 2;
                continue;
            }
            if (code === 62 && nextCode === 62) {
                tokens.push({ kind: 'punct', value: '>>' });
                i += 2;
                continue;
            }
            if (code === 60 && nextCode === 60) {
                tokens.push({ kind: 'punct', value: '<<' });
                i += 2;
                continue;
            }
            if (code === 38 && nextCode === 62) {
                tokens.push({ kind: 'punct', value: '&>' });
                i += 2;
                continue;
            }
            if (code === 38 && nextCode === 60) {
                tokens.push({ kind: 'punct', value: '&<' });
                i += 2;
                continue;
            }
            if (code === 64 && nextCode === 64) {
                tokens.push({ kind: 'punct', value: '@@' });
                i += 2;
                continue;
            }
        }
        tokens.push({ kind: 'punct', value: sql[i] });
        i++;
    }
    if (TOKEN_CACHE.size >= MAX_CACHE_SIZE)
        TOKEN_CACHE.clear();
    TOKEN_CACHE.set(sql, tokens);
    return tokens.slice();
}
function readDelimited(sql, from, delimiter) {
    const delimCode = delimiter.charCodeAt(0);
    let i = from;
    const len = sql.length;
    let hasEscaped = false;
    while (i < len) {
        if (sql.charCodeAt(i) === delimCode) {
            if (sql.charCodeAt(i + 1) === delimCode) {
                hasEscaped = true;
                break;
            }
            return [sql.slice(from, i), i + 1];
        }
        i++;
    }
    if (!hasEscaped)
        return [sql.slice(from, i), len];
    let value = sql.slice(from, i);
    while (i < len) {
        if (sql.charCodeAt(i) === delimCode) {
            if (sql.charCodeAt(i + 1) === delimCode) {
                value += delimiter;
                i += 2;
                continue;
            }
            return [value, i + 1];
        }
        value += sql[i];
        i++;
    }
    return [value, len];
}
