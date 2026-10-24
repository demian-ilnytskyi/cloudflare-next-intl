import { describe, it, expectTypeOf } from 'vitest';
import type {
    RoutingConfig,
    FirebaseAuthRoutingConfig,
    CookieConsentRoutingConfig,
    DbRoutingConfig,
} from './types.js';
import { setIntlConfig } from '../config/init_config.js';

describe('RoutingConfig type widenings', () => {
    it('widens IntlRoutingConfig with firebaseAuth, cookieConsent, and db', () => {
        expectTypeOf<RoutingConfig<['en'], 'always'>['firebaseAuth']>().toEqualTypeOf<
            FirebaseAuthRoutingConfig | undefined
        >();
        expectTypeOf<RoutingConfig<['en'], 'always'>['cookieConsent']>().toEqualTypeOf<
            CookieConsentRoutingConfig | undefined
        >();
        expectTypeOf<RoutingConfig<['en'], 'always'>['db']>().toEqualTypeOf<
            DbRoutingConfig | undefined
        >();
        expectTypeOf<RoutingConfig<['en'], 'always'>>().toHaveProperty('errorHandling');
        expectTypeOf(setIntlConfig<['en'], 'always'>)
            .parameter(0)
            .toMatchTypeOf<RoutingConfig<['en'], 'always'>>();
    });
});
