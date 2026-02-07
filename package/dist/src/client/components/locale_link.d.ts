import { type LinkProps } from 'next/link';
import { type ComponentProps } from 'react';
type NextLinkProps = Omit<ComponentProps<'a'>, keyof LinkProps> & Omit<LinkProps, 'locale' | 'href' | 'prefetch' | 'onNavigate' | 'hrefLang' | 'replace' | 'scroll'>;
export type LocaleLinkProps = NextLinkProps & {
    locale: string;
};
declare const LocaleLink: import("react").ForwardRefExoticComponent<Omit<LocaleLinkProps, "ref"> & import("react").RefAttributes<HTMLAnchorElement>>;
export default LocaleLink;
