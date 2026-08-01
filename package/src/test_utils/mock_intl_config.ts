import type { RoutingConfig } from '../types/types';

const mockIntlConfig: RoutingConfig<readonly ['en', 'de'], 'as-needed'> = {
    locales: ['en', 'de'] as const,
    defaultLocale: 'en',
};

export default mockIntlConfig;
