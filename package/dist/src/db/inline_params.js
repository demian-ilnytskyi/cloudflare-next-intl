import encodeParam from './encode_param';
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
export default function inlineParams(statement, params) {
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
                    if (c >= 48 && c <= 57)
                        j++;
                    else
                        break;
                }
                const index = Number(statement.slice(i + 1, j));
                if (index < 1 || index > params.length) {
                    throw new Error(`db: statement references $${index} but only ${params.length} param(s) were provided.`);
                }
                if (i > lastIndex)
                    result += statement.slice(lastIndex, i);
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
    if (lastIndex === 0)
        return statement;
    if (lastIndex < len)
        result += statement.slice(lastIndex);
    return result;
}
function findStringEnd(statement, from) {
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
function findQuotedIdentifierEnd(statement, from) {
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
function findDollarQuoteEnd(statement, from) {
    const tagMatch = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(statement.slice(from));
    if (!tagMatch)
        return from + 1;
    const tag = tagMatch[0];
    const bodyStart = from + tag.length;
    const closeIndex = statement.indexOf(tag, bodyStart);
    return closeIndex === -1 ? statement.length : closeIndex + tag.length;
}
