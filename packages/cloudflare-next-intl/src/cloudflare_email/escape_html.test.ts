import { describe, it, expect } from 'vitest';
import { escapeHtml } from './escape_html.js';

describe('escapeHtml', () => {
    it('escapes &, <, >, and "', () => {
        expect(escapeHtml(`<b>"Tom" & Jerry</b>`)).toBe('&lt;b&gt;&quot;Tom&quot; &amp; Jerry&lt;/b&gt;');
    });
    it('leaves plain text untouched', () => {
        expect(escapeHtml('hello world')).toBe('hello world');
    });
});
