'use client';

import React from 'react';
import LocationzationClientProviderCore, { LocaleContext } from 'cloudflare-next-intl-intl/internal/clientProvider';
import ClientExtensions, { type ClientExtensionsProps } from './client_extensions.js';
import type { TranslationObject } from 'cloudflare-next-intl-intl/types';

export { LocaleContext };

export interface LocationzationClientProviderProps extends ClientExtensionsProps {
    language: string;
    messages: TranslationObject;
    children: React.ReactNode;
}

export default function LocationzationClientProvider({
    language,
    messages,
    children,
    ...clientExtensionProps
}: LocationzationClientProviderProps): React.JSX.Element {
    return (
        <LocationzationClientProviderCore language={language} messages={messages}>
            <ClientExtensions {...clientExtensionProps}>
                {children}
            </ClientExtensions>
        </LocationzationClientProviderCore>
    );
}
