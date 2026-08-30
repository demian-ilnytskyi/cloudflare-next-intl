"use client";
import { jsx as _jsx } from "react/jsx-runtime";
import { forwardRef, useEffect, useState, } from 'react';
import config from '../../config/intl_config.js';
import usePathname from '../hooks/use_path_name.js';
import { localeCookieName } from '../../config/cookie_key.js';
import setCookie from '../functions/set_cookie.js';
import { useSearchParams } from 'next/navigation';
function ClientLocaleLinkComponent({ locale, className, ...rest }, ref) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [hash, setHash] = useState('');
    useEffect(() => {
        setHash(window.location.hash);
    }, [pathname, searchParams]);
    const isDefaultLocale = locale === config.defaultLocale;
    const localePrefix = isDefaultLocale ? '' : `/${locale}`;
    const search = searchParams.toString();
    const newPathname = pathname === '/' && (localePrefix) ? '' : pathname;
    const href = `${localePrefix}${newPathname}${search ? `?${search}` : ''}${hash}`;
    function handleNavigate(e) {
        e.preventDefault();
        setCookie({ name: localeCookieName, value: locale });
        window.location.replace(href);
    }
    ;
    return _jsx("a", { ref: ref, hrefLang: locale, className: className, ...rest, href: href, onClick: handleNavigate });
}
const LocaleLinkClient = forwardRef(ClientLocaleLinkComponent);
export default LocaleLinkClient;
