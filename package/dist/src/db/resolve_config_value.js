export default async function resolveConfigValue(value) {
    return typeof value === 'function' ? value() : value;
}
