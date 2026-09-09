import { withPublicDb as withPublicDbImpl, withUserDb as withUserDbImpl, resolveUserDbCredentials as resolveUserDbCredentialsImpl, } from '@cloudflare-next-intl/db';
import resolveDbConfig from './resolve_db_config.js';
export async function withPublicDb(fn, dbOverride) {
    const config = await resolveDbConfig(dbOverride);
    return withPublicDbImpl(fn, config);
}
export async function withUserDb(fn, auth, dbOverride) {
    const config = await resolveDbConfig(dbOverride);
    return withUserDbImpl(fn, auth, config);
}
export async function resolveUserDbCredentials(dbOverride) {
    const config = await resolveDbConfig(dbOverride);
    return resolveUserDbCredentialsImpl(config);
}
