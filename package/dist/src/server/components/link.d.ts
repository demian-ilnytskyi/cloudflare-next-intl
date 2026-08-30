import { type LinkProps } from 'next/link';
import { type ComponentProps } from 'react';
type NextLinkProps = Omit<ComponentProps<'a'>, keyof LinkProps> & Omit<LinkProps, 'locale'>;
declare const Link: import("react").ForwardRefExoticComponent<Omit<NextLinkProps, "ref"> & import("react").RefAttributes<HTMLAnchorElement>>;
export default Link;
