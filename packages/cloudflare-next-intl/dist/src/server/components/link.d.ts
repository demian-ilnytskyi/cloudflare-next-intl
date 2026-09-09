import { type LinkProps } from 'next/link.js';
import { type ComponentProps } from 'react';
export declare const PENDING_NAVIGATION_EVENT = "cloudflare-next-intl:pending-navigation";
export type PrefetchType = 'custom' | 'eager' | 'default';
type NextLinkProps = Omit<ComponentProps<'a'>, keyof LinkProps> & Omit<LinkProps, 'locale'> & {
    prefetchType?: PrefetchType;
    hoverPrefetchDelayMs?: number;
};
declare const Link: import("react").ForwardRefExoticComponent<Omit<NextLinkProps, "ref"> & import("react").RefAttributes<HTMLAnchorElement>>;
export default Link;
