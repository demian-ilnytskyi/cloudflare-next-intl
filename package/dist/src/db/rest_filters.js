import UnsupportedSqlError from './unsupported_sql.js';
export function resolveValue(value, params) {
    if (value.kind === 'literal')
        return value.value;
    if (value.index < 1 || value.index > params.length) {
        throw new UnsupportedSqlError(`placeholder $${value.index} with only ${params.length} param(s)`);
    }
    return params[value.index - 1];
}
export default function applyWhere(builder, node, params) {
    if (node.kind === 'and') {
        for (const child of node.children)
            applyWhere(builder, child, params);
        return builder;
    }
    if (node.kind === 'or' || node.kind === 'not') {
        builder.or(serialize(node, params));
        return builder;
    }
    if (node.kind === 'is') {
        if (node.negated)
            builder.not(node.column, 'is', null);
        else
            builder.is(node.column, null);
        return builder;
    }
    if (node.kind === 'in') {
        const values = node.values.map((value) => resolveValue(value, params));
        if (node.negated)
            builder.not(node.column, 'in', values);
        else
            builder.in(node.column, values);
        return builder;
    }
    if (node.kind === 'textSearch') {
        const query = String(resolveValue(node.value, params));
        const opts = {};
        if (node.type)
            opts.type = node.type;
        if (node.config)
            opts.config = node.config;
        if (Object.keys(opts).length)
            builder.textSearch(node.column, query, opts);
        else
            builder.textSearch(node.column, query);
        return builder;
    }
    if (node.kind === 'compare') {
        builder[node.operator](node.column, resolveValue(node.value, params));
        return builder;
    }
    return builder;
}
const FILTER_CODES = {
    eq: 'eq',
    neq: 'neq',
    gt: 'gt',
    gte: 'gte',
    lt: 'lt',
    lte: 'lte',
    like: 'like',
    ilike: 'ilike',
    regexMatch: 'match',
    regexIMatch: 'imatch',
    contains: 'cs',
    containedBy: 'cd',
    overlaps: 'ov',
    rangeGt: 'sr',
    rangeGte: 'nxl',
    rangeLt: 'sl',
    rangeLte: 'nxr',
    rangeAdjacent: 'adj',
    isDistinct: 'isdistinct',
};
const TEXT_SEARCH_CODES = { plain: 'plfts', phrase: 'phfts', websearch: 'wfts' };
function serialize(node, params) {
    if (node.kind === 'and' || node.kind === 'or') {
        const children = node.children.map((child) => serialize(child, params)).join(',');
        return node.kind === 'and' ? `and(${children})` : children;
    }
    if (node.kind === 'not')
        return `not.${serialize(node.child, params)}`;
    if (node.kind === 'is')
        return node.negated ? `not.${node.column}.is.null` : `${node.column}.is.null`;
    if (node.kind === 'in') {
        const values = node.values.map((value) => encodeFilterValue(resolveValue(value, params))).join(',');
        const str = `${node.column}.in.(${values})`;
        return node.negated ? `not.${str}` : str;
    }
    if (node.kind === 'textSearch') {
        const code = node.type ? TEXT_SEARCH_CODES[node.type] : 'fts';
        const config = node.config ? `(${node.config})` : '';
        return `${node.column}.${code}${config}.${encodeFilterValue(resolveValue(node.value, params))}`;
    }
    if (node.kind === 'compare') {
        return `${node.column}.${FILTER_CODES[node.operator]}.${encodeFilterValue(resolveValue(node.value, params))}`;
    }
    throw new UnsupportedSqlError('unsupported where node');
}
function encodeFilterValue(value) {
    if (typeof value === 'number' || typeof value === 'boolean')
        return String(value);
    if (typeof value !== 'string') {
        throw new UnsupportedSqlError(`value of type ${value === null ? 'null' : typeof value} inside an or()/not() filter`);
    }
    return /[,.():"\s]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}
