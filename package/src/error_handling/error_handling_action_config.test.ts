import { describe, it, expect, afterEach } from 'vitest';
import { setErrorHandlingActionConfig, getErrorHandlingActionConfig } from './error_handling_action_config.js';

describe('errorHandlingActionConfig', () => {
    afterEach(() => {
        setErrorHandlingActionConfig(undefined);
    });

    it('returns undefined before anything is registered', () => {
        expect(getErrorHandlingActionConfig()).toBeUndefined();
    });

    it('returns the config passed to setErrorHandlingActionConfig', () => {
        const config = { errorHandling: { onError: () => undefined } };
        setErrorHandlingActionConfig(config);
        expect(getErrorHandlingActionConfig()).toBe(config);
    });

    it('overwrites a previously registered config', () => {
        setErrorHandlingActionConfig({ errorHandling: { logToConsole: true } });
        const next = { errorHandling: { logToConsole: false } };
        setErrorHandlingActionConfig(next);
        expect(getErrorHandlingActionConfig()).toBe(next);
    });
});
