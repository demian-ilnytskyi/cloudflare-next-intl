

import { type LinkProps } from 'next/link';
import {
    forwardRef,
    Suspense,
    type ComponentProps,
    type Ref,
} from 'react';
import LocaleLinkClient from './locale_link_client';

type NextLinkProps = Omit<ComponentProps<'a'>, keyof LinkProps> &
    Omit<LinkProps, 'locale' | 'href' | 'prefetch' | 'onNavigate' | 'hrefLang' | 'replace' | 'scroll'>;

export type LocaleLinkProps = NextLinkProps & {
    locale: string;
};

function LocaleLinkComponent(
    params: LocaleLinkProps,
    ref: Ref<HTMLAnchorElement>
) {
    return <Suspense fallback={<a {...params} ref={ref} className={params.className + ' pointer-events-none'} />}>
        <LocaleLinkClient ref={ref} {...params} />
    </Suspense>;
}

const LocaleLink = forwardRef(LocaleLinkComponent);

export default LocaleLink;
