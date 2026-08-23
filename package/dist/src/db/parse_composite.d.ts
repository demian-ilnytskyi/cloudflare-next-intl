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
export default function parseComposite(literal: string): (string | null)[];
