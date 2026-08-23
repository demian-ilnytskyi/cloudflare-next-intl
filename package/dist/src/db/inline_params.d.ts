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
export default function inlineParams(statement: string, params: unknown[]): string;
