/**
 * Parses one row of Postgres' composite-literal text format —
 * `(field1,field2,...)`, comma-separated, each field either bare or
 * `"…"`-quoted with doubled `""` for an embedded quote, and an empty bare
 * field meaning `NULL` — into a positional array of field strings (or
 * `null`).
 *
 * `cfni_exec.sql` casts every returned row with `r::text` to get this
 * format, because it stays correct even with duplicate column names (a
 * common shape after `select a.*, b.*`), unlike `row_to_json`, which keys
 * fields by name and both collapses duplicates and re-encodes nested types
 * like arrays as JSON instead of pg's own text form.
 *
 * @param literal A single row's `(...)`-wrapped composite-literal text.
 * @returns The row's fields, in column order, `null` for a bare empty field.
 */
export default function parseComposite(literal: string): (string | null)[] {
    const fields: (string | null)[] = [];
    let i = 1; // skip leading '('
    const len = literal.length - 1; // index of the trailing ')'

    // A single field, e.g. `()`, has no fields at all — every other case
    // has at least one comma-delimited field, including a final empty one
    // (a trailing comma right before the closing paren).
    if (len === i) return fields;

    while (true) {
        if (literal[i] === '"') {
            let value = '';
            i++;
            while (i < len) {
                if (literal[i] === '"') {
                    if (literal[i + 1] === '"') {
                        value += '"';
                        i += 2;
                        continue;
                    }
                    break;
                }
                value += literal[i];
                i++;
            }
            i++; // closing quote
            fields.push(value);
        } else {
            let value = '';
            while (i < len && literal[i] !== ',') {
                value += literal[i];
                i++;
            }
            fields.push(value === '' ? null : value);
        }

        if (literal[i] === ',') {
            i++;
            continue;
        }
        break;
    }

    return fields;
}
