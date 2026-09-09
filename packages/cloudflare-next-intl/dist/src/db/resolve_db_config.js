export default async function resolveDbConfig(dbOverride) {
    let base = {};
    try {
        base = (await import('../config/intl_config.js')).default;
    }
    catch {
    }
    if (!dbOverride)
        return base;
    return { ...base, db: dbOverride };
}
