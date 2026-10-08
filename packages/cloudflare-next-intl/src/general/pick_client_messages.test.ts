import { describe, it, expect } from 'vitest';
import pickClientMessages from './pick_client_messages.js';

const messages = { Common: { ok: 'OK' }, Auth: { login: 'Log in' }, Home: { title: 'Home' } };

describe('pickClientMessages', () => {
    it('returns all messages when unset or true', () => {
        expect(pickClientMessages(messages, undefined)).toBe(messages);
        expect(pickClientMessages(messages, true)).toBe(messages);
    });

    it('returns no messages when false', () => {
        expect(pickClientMessages(messages, false)).toEqual({});
    });

    it('returns only the listed namespaces and skips unknown ones', () => {
        expect(pickClientMessages(messages, ['Auth', 'Missing'])).toEqual({ Auth: { login: 'Log in' } });
    });

    it('auto uses injected manifest', () => {
        expect(pickClientMessages({ A: { x: '1' }, B: { y: '2' } }, 'auto', ['A'])).toEqual({ A: { x: '1' } });
    });

    it('auto with manifest true sends all', () => {
        const m = { A: { x: '1' } };
        expect(pickClientMessages(m, 'auto', true)).toBe(m);
    });

    it('auto without manifest (plugin off) sends all', () => {
        const m = { A: { x: '1' } };
        expect(pickClientMessages(m, 'auto', undefined)).toBe(m);
    });

    it('array supports trailing wildcard', () => {
        expect(pickClientMessages({ CatA: {}, CatB: {}, X: {} }, ['Cat*'])).toEqual({ CatA: {}, CatB: {} });
    });

    it('manifest namespace missing from messages is skipped', () => {
        expect(pickClientMessages({ A: {} }, 'auto', ['A', 'Gone'])).toEqual({ A: {} });
    });

    it('auto uses default readAutoManifest from global or undefined fallback', () => {
        const m = { A: { x: '1' }, B: { y: '2' } };
        expect(pickClientMessages(m, 'auto')).toBe(m);

        (globalThis as Record<string, unknown>).__CFNI_CLIENT_MESSAGES__ = ['B'];
        expect(pickClientMessages(m, 'auto')).toEqual({ B: { y: '2' } });
        delete (globalThis as Record<string, unknown>).__CFNI_CLIENT_MESSAGES__;
    });
});


