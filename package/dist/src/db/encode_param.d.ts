/**
 * Serialises a JS value to a Postgres literal, mirroring how `pg` sends
 * values over the wire so an inlined literal type-infers the same way a
 * bound parameter would.
 *
 * Used to substitute `$n` placeholders client-side in Supabase mode, where
 * `cfni_exec` takes a single already-complete statement — see
 * {@link inlineParams}.
 */
export default function encodeParam(value: unknown): string;
