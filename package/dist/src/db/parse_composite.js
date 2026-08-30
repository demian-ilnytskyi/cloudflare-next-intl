export default function parseComposite(literal) {
    const fields = [];
    let i = 1;
    const len = literal.length - 1;
    if (len === i)
        return fields;
    while (true) {
        if (literal.charCodeAt(i) === 34) {
            i++;
            const start = i;
            let hasEscaped = false;
            while (i < len) {
                if (literal.charCodeAt(i) === 34) {
                    if (literal.charCodeAt(i + 1) === 34) {
                        hasEscaped = true;
                        break;
                    }
                    break;
                }
                i++;
            }
            if (!hasEscaped) {
                fields.push(literal.slice(start, i));
                i++;
            }
            else {
                let value = literal.slice(start, i);
                while (i < len) {
                    if (literal.charCodeAt(i) === 34) {
                        if (literal.charCodeAt(i + 1) === 34) {
                            value += '"';
                            i += 2;
                            continue;
                        }
                        break;
                    }
                    value += literal[i];
                    i++;
                }
                i++;
                fields.push(value);
            }
        }
        else {
            const start = i;
            while (i < len && literal.charCodeAt(i) !== 44) {
                i++;
            }
            const value = literal.slice(start, i);
            fields.push(value === '' ? null : value);
        }
        if (literal.charCodeAt(i) === 44) {
            i++;
            continue;
        }
        break;
    }
    return fields;
}
