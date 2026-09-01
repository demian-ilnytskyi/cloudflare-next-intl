import { describe, it, expect } from 'vitest';
import { findReportErrorCalls } from './find_report_error_calls.js';

describe('findReportErrorCalls', () => {
    it('returns an empty array when there is no reportError call', () => {
        expect(findReportErrorCalls('export default function Page() {}')).toEqual([]);
    });

    it('finds a single-line call and locates the insertion point right after the opening brace', () => {
        const source = `void reportError(intlConfig, { error, classOrMethodName: 'X' });`;
        const calls = findReportErrorCalls(source);
        expect(calls).toHaveLength(1);
        const [call] = calls;
        expect(call.hasExplicitUseAuthUser).toBe(false);
        expect(call.insertPos).not.toBeNull();
        expect(source[call.insertPos! - 1]).toBe('{');
    });

    it('finds a multi-line call', () => {
        const source = `
reportError(cfg, {
    error,
    classOrMethodName: 'X',
    params: { foo: () => { return 1; } },
});
`;
        const calls = findReportErrorCalls(source);
        expect(calls).toHaveLength(1);
        expect(calls[0].insertPos).not.toBeNull();
        expect(calls[0].hasExplicitUseAuthUser).toBe(false);
    });

    it('detects an already-explicit useAuthUser and never proposes overwriting it', () => {
        const source = `reportError(cfg, { error, useAuthUser: true });`;
        const calls = findReportErrorCalls(source);
        expect(calls[0].hasExplicitUseAuthUser).toBe(true);
    });

    it('returns insertPos null when the second argument is not a plain object literal', () => {
        const source = `reportError(cfg, buildParams(x));`;
        const calls = findReportErrorCalls(source);
        expect(calls).toHaveLength(1);
        expect(calls[0].insertPos).toBeNull();
    });

    it('is not confused by braces/commas inside string literals', () => {
        const source = `reportError(cfg, { classOrMethodName: 'a, b { c }' });`;
        const calls = findReportErrorCalls(source);
        expect(calls).toHaveLength(1);
        expect(calls[0].insertPos).not.toBeNull();
        expect(calls[0].hasExplicitUseAuthUser).toBe(false);
    });

    it('correctly skips a first argument that is itself an object literal', () => {
        const source = `reportError({ foo: 1 }, { classOrMethodName: 'x' });`;
        const calls = findReportErrorCalls(source);
        expect(calls).toHaveLength(1);
        expect(calls[0].insertPos).not.toBeNull();
    });

    it('is not confused by an escaped quote inside a string literal', () => {
        const source = String.raw`reportError(cfg, { classOrMethodName: 'it\'s ok' });`;
        const calls = findReportErrorCalls(source);
        expect(calls).toHaveLength(1);
        expect(calls[0].insertPos).not.toBeNull();
        expect(calls[0].hasExplicitUseAuthUser).toBe(false);
    });

    it('returns insertPos null (never throws) for an unterminated string literal', () => {
        const source = `reportError(cfg, { classOrMethodName: 'unterminated`;
        const calls = findReportErrorCalls(source);
        expect(calls).toHaveLength(1);
        expect(calls[0].insertPos).toBeNull();
        expect(calls[0].hasExplicitUseAuthUser).toBe(false);
    });

    it('skips over a line comment inside the call arguments', () => {
        const source = `
reportError(cfg, {
    // classOrMethodName: 'not this one'
    classOrMethodName: 'X',
});
`;
        const calls = findReportErrorCalls(source);
        expect(calls).toHaveLength(1);
        expect(calls[0].insertPos).not.toBeNull();
    });

    it('skips over a block comment inside the call arguments', () => {
        const source = `reportError(cfg, { /* a note, with a } brace and , comma */ classOrMethodName: 'X' });`;
        const calls = findReportErrorCalls(source);
        expect(calls).toHaveLength(1);
        expect(calls[0].insertPos).not.toBeNull();
    });

    it('returns insertPos null (never throws) when a line comment runs to end of file with no trailing newline', () => {
        const source = `reportError(cfg, { classOrMethodName: 'X' // no closing`;
        const calls = findReportErrorCalls(source);
        expect(calls).toHaveLength(1);
        expect(calls[0].insertPos).toBeNull();
    });

    it('returns insertPos null (never throws) for an unterminated block comment', () => {
        const source = `reportError(cfg, { classOrMethodName: 'X' /* no closing`;
        const calls = findReportErrorCalls(source);
        expect(calls).toHaveLength(1);
        expect(calls[0].insertPos).toBeNull();
    });

    it('finds multiple calls in one file independently', () => {
        const source = `
reportError(cfg, { classOrMethodName: 'a' });
reportError(cfg, { classOrMethodName: 'b', useAuthUser: false });
`;
        const calls = findReportErrorCalls(source);
        expect(calls).toHaveLength(2);
        expect(calls[0].hasExplicitUseAuthUser).toBe(false);
        expect(calls[1].hasExplicitUseAuthUser).toBe(true);
    });
});
