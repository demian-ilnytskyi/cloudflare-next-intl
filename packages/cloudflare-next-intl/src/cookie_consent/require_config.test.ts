import { describe, it, expect } from 'vitest';
import requireCookieConsentConfig from './require_config.js';
import type { CookieConsentRoutingConfig } from '../types/types.js';

describe('requireCookieConsentConfig', () => {
    it('throws when cookieConsent config is undefined', () => {
        expect(() => requireCookieConsentConfig(undefined)).toThrow(
            /cookieConsent.*is not set/,
        );
    });

    it('does not throw when cookieConsent config is provided', () => {
        const cc: CookieConsentRoutingConfig = {};
        expect(() => requireCookieConsentConfig(cc)).not.toThrow();
    });
});
