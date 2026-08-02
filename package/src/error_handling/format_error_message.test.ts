import { describe, it, expect } from 'vitest';
import formatErrorMessage from './format_error_message';

describe('formatErrorMessage', () => {
    it('formats a plain Error with classOrMethodName', () => {
        const message = formatErrorMessage({ error: new Error('boom'), classOrMethodName: 'foo' });
        expect(message).toContain('[foo] Error: Error: boom');
    });

    it('appends a Params section when params is non-empty', () => {
        const message = formatErrorMessage({ error: 'boom', classOrMethodName: 'foo', params: { key: 'value' } });
        expect(message).toContain('Params: {"key":"value"}');
    });

    it('omits the Params section when params is undefined', () => {
        const message = formatErrorMessage({ error: 'boom', classOrMethodName: 'foo' });
        expect(message).not.toContain('Params:');
    });

    it('omits the Params section when params is an empty object', () => {
        const message = formatErrorMessage({ error: 'boom', classOrMethodName: 'foo', params: {} });
        expect(message).not.toContain('Params:');
    });

    it('appends a Source: client line when isClient is true', () => {
        const message = formatErrorMessage({ error: 'boom', classOrMethodName: 'foo', isClient: true });
        expect(message).toContain('Source: client');
    });

    it('omits the Source line when isClient is false/undefined', () => {
        const message = formatErrorMessage({ error: 'boom', classOrMethodName: 'foo' });
        expect(message).not.toContain('Source:');
    });

    it('never throws for unserializable params', () => {
        const circular: Record<string, unknown> = {};
        circular.self = circular;
        expect(() => formatErrorMessage({ error: 'boom', classOrMethodName: 'foo', params: circular })).not.toThrow();
    });
});
