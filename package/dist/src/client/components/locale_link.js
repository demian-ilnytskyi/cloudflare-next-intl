import { jsx as _jsx } from "react/jsx-runtime";
import { forwardRef, Suspense, } from 'react';
import LocaleLinkClient from './locale_link_client.js';
function LocaleLinkComponent(params, ref) {
    return _jsx(Suspense, { fallback: _jsx("a", { ...params, ref: ref, className: params.className + ' pointer-events-none' }), children: _jsx(LocaleLinkClient, { ref: ref, ...params }) });
}
const LocaleLink = forwardRef(LocaleLinkComponent);
export default LocaleLink;
