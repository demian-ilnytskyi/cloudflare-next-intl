import encodeParam from './encode_param.js';

/**
 * Substitutes `$1`, `$2`, … placeholders in a generated statement with
 * literal-encoded values, so a single-statement RPC call
 * (`cfni_exec(statement, params default '[]')`) never needs to bind params
 * itself — `EXECUTE ... USING` cannot bind more than one differently-typed
 * value the way a real driver does.
 *
 * Placeholders inside single-quoted strings, `E'...'` escape strings,
 * dollar-quoted bodies (`$$...$$` / `$tag$...$tag$`), double-quoted
 * identifiers, and `--`/`/* *\/` comments are left untouched, so a literal
 * `$1` typed by the user in a string never gets rewritten.
 *
 * @param statement The SQL text `drizzle-orm/pg-proxy` generated, with `$n` placeholders.
 * @param params Positional parameter values, 1-indexed to match the placeholders.
 * @returns The statement with every placeholder replaced by its literal.
 * @throws If the statement references `$n` beyond `params.length`.
 */
export default function inlineParams(statement: string, params: unknown[]): string {
    let result = '';
    let i = 0;
    let lastIndex = 0;
    const len = statement.length;

    while (i < len) {
        const code = statement.charCodeAt(i);

        if (code === 45 && statement.charCodeAt(i + 1) === 45) { // --
            const end = statement.indexOf('\n', i);
            const stop = end === -1 ? len : end + 1;
            i = stop;
            continue;
        }

        if (code === 47 && statement.charCodeAt(i + 1) === 42) { // /*
            const end = statement.indexOf('*/', i + 2);
            const stop = end === -1 ? len : end + 2;
            i = stop;
            continue;
        }

        if (code === 39 || (code === 69 && statement.charCodeAt(i + 1) === 39)) { // ' or E'
            const start = code === 69 ? i + 1 : i;
            const end = findStringEnd(statement, start + 1);
            i = end;
            continue;
        }

        if (code === 34) { // "
            const end = findQuotedIdentifierEnd(statement, i + 1);
            i = end;
            continue;
        }

        if (code === 36) { // $
            const nextCode = statement.charCodeAt(i + 1);
            if (nextCode >= 48 && nextCode <= 57) {
                let j = i + 2;
                while (j < len) {
                    const c = statement.charCodeAt(j);
                    if (c >= 48 && c <= 57) j++;
                    else break;
                }
                const index = Number(statement.slice(i + 1, j));
                if (index < 1 || index > params.length) {
                    throw new Error(`db: statement references $${index} but only ${params.length} param(s) were provided.`);
                }
                if (i > lastIndex) result += statement.slice(lastIndex, i);
                result += encodeParam(params[index - 1]);
                i = j;
                lastIndex = j;
                continue;
            }

            const tagEnd = findDollarQuoteEnd(statement, i);
            i = tagEnd;
            continue;
        }

        i++;
    }

    if (lastIndex === 0) return statement;
    if (lastIndex < len) result += statement.slice(lastIndex);
    return result;
}

function findStringEnd(statement: string, from: number): number {
    let i = from;
    while (i < statement.length) {
        if (statement[i] === "'") {
            if (statement[i + 1] === "'") {
                i += 2;
                continue;
            }
            return i + 1;
        }
        if (statement[i] === '\\' && statement[i - 1] !== '\\') {
            // Backslash escapes are only meaningful in E'' strings, but
            // skipping the next char either way is harmless here since we
            // are only looking for the terminating quote.
            i += 2;
            continue;
        }
        i++;
    }
    return statement.length;
}

function findQuotedIdentifierEnd(statement: string, from: number): number {
    let i = from;
    while (i < statement.length) {
        if (statement[i] === '"') {
            if (statement[i + 1] === '"') {
                i += 2;
                continue;
            }
            return i + 1;
        }
        i++;
    }
    return statement.length;
}

// Lookup table for dollar-quote tag continuation characters (A-Z, a-z, 0-9, _),
// built once at module load so the scan below is a single array read instead
// of a chain of range comparisons.
const DOLLAR_TAG_CONTINUE_CHAR = new Uint8Array(128);
for (let c = 65; c <= 90; c++) DOLLAR_TAG_CONTINUE_CHAR[c] = 1; // A-Z
for (let c = 97; c <= 122; c++) DOLLAR_TAG_CONTINUE_CHAR[c] = 1; // a-z
for (let c = 48; c <= 57; c++) DOLLAR_TAG_CONTINUE_CHAR[c] = 1; // 0-9
DOLLAR_TAG_CONTINUE_CHAR[95] = 1; // _

function findDollarQuoteEnd(statement: string, from: number): number {
    const len = statement.length;
    let i = from + 1;
    const first = statement.charCodeAt(i);
    let valid = first === 36;

    if (valid) {
        i++; // empty tag: $$
    } else if ((first >= 65 && first <= 90) || (first >= 97 && first <= 122) || first === 95) {
        i++;
        while (i < len) {
            const c = statement.charCodeAt(i);
            if (c < 128 && DOLLAR_TAG_CONTINUE_CHAR[c] === 1) i++;
            else break;
        }
        valid = statement.charCodeAt(i) === 36;
        // Consume the closing '$' when the tag is valid; incrementing past a
        // non-'$' character here is harmless because the !valid check below
        // returns before `i` is used again.
        i++;
    }

    if (!valid) return from + 1; // '$' is not starting a valid, closed dollar-quote tag

    const tag = statement.slice(from, i);
    const closeIndex = statement.indexOf(tag, i);
    return closeIndex === -1 ? len : closeIndex + tag.length;
}
