export const ERROR_STATUSES = ['new', 'investigating', 'resolved', 'muted'];
export const BOARD_STATUSES = ['new', 'investigating', 'resolved'];
const MAX_MESSAGE_LENGTH = 2000;
const MAX_STACK_LENGTH = 8000;
const MAX_PARAMS_LENGTH = 4000;
export const ERRORS_PAGE_SIZE = 50;
export const MAX_IDS_PER_ACTION = 200;
export function isErrorStatus(value) {
    return ERROR_STATUSES.includes(value);
}
export function encodeCursor(updatedAt, id) {
    return `${updatedAt}:${id}`;
}
function decodeCursor(raw) {
    const [updatedAtPart, idPart] = raw.split(':');
    const updatedAt = Number(updatedAtPart);
    const id = Number(idPart);
    if (!Number.isInteger(updatedAt) || !Number.isInteger(id) || updatedAt < 0 || id < 0)
        return null;
    return { updatedAt, id };
}
export function parseErrorsListFilters(raw) {
    const status = raw.status === 'all' || (raw.status && isErrorStatus(raw.status)) ? raw.status : 'all';
    const cursor = raw.cursor && decodeCursor(raw.cursor) ? raw.cursor : null;
    return {
        flavour: raw.flavour ?? 'all',
        status,
        q: (raw.q ?? '').slice(0, 200),
        cursor,
    };
}
export function boundErrorIds(ids) {
    if (!Array.isArray(ids) || ids.length === 0)
        throw new Error('errors_board: id list must not be empty');
    if (!ids.every((id) => Number.isInteger(id) && id > 0)) {
        throw new Error('errors_board: every id must be a positive integer');
    }
    return ids.slice(0, MAX_IDS_PER_ACTION);
}
function truncate(value, maxLength) {
    return value.length > maxLength ? value.slice(0, maxLength) : value;
}
export { MAX_MESSAGE_LENGTH, MAX_STACK_LENGTH, MAX_PARAMS_LENGTH, truncate };
const CREATE_TABLE_SQL = `
    CREATE TABLE IF NOT EXISTS errors (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        fingerprint TEXT    NOT NULL UNIQUE,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL,
        flavour     TEXT    NOT NULL,
        caller      TEXT    NOT NULL,
        message     TEXT    NOT NULL,
        stack       TEXT,
        params      TEXT,
        is_client   INTEGER NOT NULL DEFAULT 0,
        status      TEXT    NOT NULL DEFAULT 'new',
        count       INTEGER NOT NULL DEFAULT 1,
        user_email  TEXT,
        reopen_count INTEGER NOT NULL DEFAULT 0,
        resolved_at  INTEGER
    )
`;
const CREATE_INDEXES_SQL = [
    'CREATE INDEX IF NOT EXISTS idx_errors_updated_at ON errors (updated_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_errors_flavour ON errors (flavour)',
    'CREATE INDEX IF NOT EXISTS idx_errors_status ON errors (status)',
];
const schemaReadyByDb = new WeakMap();
export function ensureSchema(db) {
    const existing = schemaReadyByDb.get(db);
    if (existing)
        return existing;
    const ready = db
        .batch([db.prepare(CREATE_TABLE_SQL), ...CREATE_INDEXES_SQL.map((sql) => db.prepare(sql))])
        .then(() => undefined)
        .catch((error) => {
        schemaReadyByDb.delete(db);
        throw error;
    });
    schemaReadyByDb.set(db, ready);
    return ready;
}
export async function computeFingerprint(flavour, caller, message) {
    const data = new TextEncoder().encode(`${flavour}|${caller}|${message}`);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
export async function recordError(db, input) {
    await ensureSchema(db);
    const message = truncate(input.message, MAX_MESSAGE_LENGTH);
    const stack = input.stack ? truncate(input.stack, MAX_STACK_LENGTH) : null;
    const params = input.params ? truncate(input.params, MAX_PARAMS_LENGTH) : null;
    const fingerprint = await computeFingerprint(input.flavour, input.caller, message);
    const now = Date.now();
    await db
        .prepare(`INSERT INTO errors (fingerprint, created_at, updated_at, flavour, caller, message, stack, params, is_client, user_email)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (fingerprint) DO UPDATE SET
               updated_at   = excluded.updated_at,
               count        = errors.count + 1,
               stack        = excluded.stack,
               params       = excluded.params,
               user_email   = excluded.user_email,
               reopen_count = CASE WHEN errors.status = 'resolved' THEN errors.reopen_count + 1 ELSE errors.reopen_count END,
               status       = CASE WHEN errors.status = 'resolved' THEN 'new' ELSE errors.status END`)
        .bind(fingerprint, now, now, input.flavour, input.caller, message, stack, params, input.isClient ? 1 : 0, input.userEmail)
        .run();
}
function buildListQuery(filters) {
    const conditions = [];
    const bindings = [];
    if (filters.flavour !== 'all') {
        conditions.push('flavour = ?');
        bindings.push(filters.flavour);
    }
    if (filters.status === 'all') {
        conditions.push("status != 'muted'");
    }
    else {
        conditions.push('status = ?');
        bindings.push(filters.status);
    }
    if (filters.q) {
        conditions.push('(message LIKE ? OR caller LIKE ? OR user_email LIKE ?)');
        const like = `%${filters.q}%`;
        bindings.push(like, like, like);
    }
    if (filters.cursor !== null) {
        const decoded = decodeCursor(filters.cursor);
        if (decoded) {
            conditions.push('(updated_at < ? OR (updated_at = ? AND id < ?))');
            bindings.push(decoded.updatedAt, decoded.updatedAt, decoded.id);
        }
    }
    bindings.push(ERRORS_PAGE_SIZE + 1);
    return { sql: `SELECT * FROM errors WHERE ${conditions.join(' AND ')} ORDER BY updated_at DESC, id DESC LIMIT ?`, bindings };
}
function paginate(rows) {
    const hasMore = rows.length > ERRORS_PAGE_SIZE;
    const page = hasMore ? rows.slice(0, ERRORS_PAGE_SIZE) : rows;
    const last = page[page.length - 1];
    return { rows: page, nextCursor: hasMore && last ? encodeCursor(last.updated_at, last.id) : null };
}
export async function listErrors(db, filters) {
    await ensureSchema(db);
    const { sql, bindings } = buildListQuery(filters);
    const result = await db.prepare(sql).bind(...bindings).all();
    return paginate(result.results ?? []);
}
export async function getErrorById(db, id) {
    await ensureSchema(db);
    const row = await db.prepare('SELECT * FROM errors WHERE id = ?').bind(id).first();
    return row ?? null;
}
export async function distinctFlavours(db) {
    await ensureSchema(db);
    const result = await db.prepare('SELECT DISTINCT flavour FROM errors ORDER BY flavour').all();
    return (result.results ?? []).map((row) => row.flavour);
}
export async function loadErrorsBoard(db, filters) {
    await ensureSchema(db);
    const listQuery = buildListQuery(filters);
    const [listResult, flavourResult, countResult] = await db.batch([
        db.prepare(listQuery.sql).bind(...listQuery.bindings),
        db.prepare('SELECT DISTINCT flavour FROM errors ORDER BY flavour'),
        db.prepare('SELECT status, COUNT(*) as count FROM errors GROUP BY status'),
    ]);
    const counts = { new: 0, investigating: 0, resolved: 0, muted: 0 };
    for (const row of (countResult.results ?? [])) {
        counts[row.status] = row.count;
    }
    return {
        ...paginate((listResult.results ?? [])),
        flavours: (flavourResult.results ?? []).map((row) => row.flavour),
        counts,
    };
}
export async function setErrorsStatus(db, ids, status) {
    await ensureSchema(db);
    const boundedIds = boundErrorIds(ids);
    const placeholders = boundedIds.map(() => '?').join(', ');
    await db
        .prepare(`UPDATE errors
                SET status      = ?,
                    resolved_at = CASE WHEN ? = 'resolved' THEN ? ELSE resolved_at END
              WHERE id IN (${placeholders})`)
        .bind(status, status, Date.now(), ...boundedIds)
        .run();
}
export async function deleteErrorsByIds(db, ids) {
    await ensureSchema(db);
    const boundedIds = boundErrorIds(ids);
    const placeholders = boundedIds.map(() => '?').join(', ');
    await db.prepare(`DELETE FROM errors WHERE id IN (${placeholders})`).bind(...boundedIds).run();
}
export async function deleteAllResolvedErrors(db) {
    await ensureSchema(db);
    await db.prepare("DELETE FROM errors WHERE status = 'resolved'").run();
}
