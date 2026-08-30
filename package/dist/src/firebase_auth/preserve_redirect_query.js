import config from '@intl-config';
export function preserveRedirectQueryEnabled() {
    return config.firebaseAuth?.preserveRedirectQuery !== false;
}
export default function withRedirectQuery(target, search) {
    if (!search || !preserveRedirectQueryEnabled())
        return target;
    return `${target}${search}`;
}
