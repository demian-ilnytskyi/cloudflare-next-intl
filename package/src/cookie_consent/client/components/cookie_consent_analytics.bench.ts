import { bench, describe } from 'vitest';
import { googleConsentModeBootstrapScript } from './cookie_consent_analytics';

describe('googleConsentModeBootstrapScript', () => {
    bench('all providers configured', () => {
        googleConsentModeBootstrapScript({
            googleAnalyticsId: 'G-XXX',
            googleAdsId: 'AW-YYY',
            googleAdSenseId: 'ca-pub-ZZZ',
        });
    });

    bench('no providers configured', () => {
        googleConsentModeBootstrapScript({});
    });
});
