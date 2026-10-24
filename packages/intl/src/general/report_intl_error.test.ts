import { describe, it, expect, vi, beforeEach } from 'vitest';
import reportIntlError from './report_intl_error.js';
import mockIntlConfig from '../test_utils/mock_intl_config.js';

describe('reportIntlError', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        delete (mockIntlConfig as { onError?: unknown }).onError;
    });

    it('defaults to console.error', () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const err = new Error('boom');
        reportIntlError(err, 'getTranslations');
        expect(errorSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy).toHaveBeenCalledWith('[cloudflare-next-intl-intl]', 'getTranslations', err);
    });

    it('calls config.onError instead of console.error', () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const onError = vi.fn();
        (mockIntlConfig as { onError?: unknown }).onError = onError;
        const err = new Error('boom');
        reportIntlError(err, 'getTranslations');
        expect(onError).toHaveBeenCalledWith(err, 'getTranslations');
        expect(errorSpy).not.toHaveBeenCalled();
    });

    it('swallows a throwing onError', () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        (mockIntlConfig as { onError?: unknown }).onError = () => {
            throw new Error('sink failed');
        };
        const err = new Error('boom');
        expect(() => reportIntlError(err, 'getTranslations')).not.toThrow();
        expect(errorSpy).not.toHaveBeenCalled();
    });

    it('swallows a rejecting onError', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        (mockIntlConfig as { onError?: unknown }).onError = () => Promise.reject(new Error('async sink failed'));
        const err = new Error('boom');
        expect(() => reportIntlError(err, 'getTranslations')).not.toThrow();
        await new Promise((r) => setTimeout(r, 10));
        expect(errorSpy).not.toHaveBeenCalled();
    });
});
