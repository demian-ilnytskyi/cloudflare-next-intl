import { describe, expect, it } from 'vitest';
import tokenizeSql from './sql_tokens';

describe('tokenizeSql', () => {
    it('tokenizes a drizzle-shaped select', () => {
        expect(tokenizeSql('select "users"."id" from "users" where "users"."id" = $1 limit 10')).toEqual([
            { kind: 'word', value: 'select' },
            { kind: 'quoted', value: 'users' },
            { kind: 'punct', value: '.' },
            { kind: 'quoted', value: 'id' },
            { kind: 'word', value: 'from' },
            { kind: 'quoted', value: 'users' },
            { kind: 'word', value: 'where' },
            { kind: 'quoted', value: 'users' },
            { kind: 'punct', value: '.' },
            { kind: 'quoted', value: 'id' },
            { kind: 'punct', value: '=' },
            { kind: 'param', index: 1 },
            { kind: 'word', value: 'limit' },
            { kind: 'number', value: '10' },
        ]);
    });

    it('lowercases bare words and keeps quoted identifiers verbatim', () => {
        expect(tokenizeSql('SELECT * FROM "Users"')).toEqual([
            { kind: 'word', value: 'select' },
            { kind: 'punct', value: '*' },
            { kind: 'word', value: 'from' },
            { kind: 'quoted', value: 'Users' },
        ]);
    });

    it('reads multi-character operators as one token', () => {
        expect(tokenizeSql('a <> b >= c <= d != e -|- f ~* g @> h <@ i && j >> k << l &> m &< n @@ o')).toEqual([
            { kind: 'word', value: 'a' },
            { kind: 'punct', value: '<>' },
            { kind: 'word', value: 'b' },
            { kind: 'punct', value: '>=' },
            { kind: 'word', value: 'c' },
            { kind: 'punct', value: '<=' },
            { kind: 'word', value: 'd' },
            { kind: 'punct', value: '!=' },
            { kind: 'word', value: 'e' },
            { kind: 'punct', value: '-|-' },
            { kind: 'word', value: 'f' },
            { kind: 'punct', value: '~*' },
            { kind: 'word', value: 'g' },
            { kind: 'punct', value: '@>' },
            { kind: 'word', value: 'h' },
            { kind: 'punct', value: '<@' },
            { kind: 'word', value: 'i' },
            { kind: 'punct', value: '&&' },
            { kind: 'word', value: 'j' },
            { kind: 'punct', value: '>>' },
            { kind: 'word', value: 'k' },
            { kind: 'punct', value: '<<' },
            { kind: 'word', value: 'l' },
            { kind: 'punct', value: '&>' },
            { kind: 'word', value: 'm' },
            { kind: 'punct', value: '&<' },
            { kind: 'word', value: 'n' },
            { kind: 'punct', value: '@@' },
            { kind: 'word', value: 'o' },
        ]);
    });

    it('unescapes doubled quotes in identifiers and strings', () => {
        expect(tokenizeSql(`"we""ird" 'it''s'`)).toEqual([
            { kind: 'quoted', value: 'we"ird' },
            { kind: 'string', value: "it's" },
        ]);
    });

    it('drops line and block comments and extra whitespace', () => {
        expect(tokenizeSql('select -- one\n /* two */ *')).toEqual([
            { kind: 'word', value: 'select' },
            { kind: 'punct', value: '*' },
        ]);
    });

    it('reads unterminated comments, strings and identifiers to end of input', () => {
        expect(tokenizeSql('select /* never closed')).toEqual([{ kind: 'word', value: 'select' }]);
        expect(tokenizeSql("'open")).toEqual([{ kind: 'string', value: 'open' }]);
        expect(tokenizeSql('"open')).toEqual([{ kind: 'quoted', value: 'open' }]);
        expect(tokenizeSql('select --')).toEqual([{ kind: 'word', value: 'select' }]);
        expect(tokenizeSql('a $')).toEqual([{ kind: 'word', value: 'a' }, { kind: 'punct', value: '$' }]);
    });

    it('reads decimal numbers and unknown characters as punct', () => {
        expect(tokenizeSql('1.5 ;')).toEqual([
            { kind: 'number', value: '1.5' },
            { kind: 'punct', value: ';' },
        ]);
    });

    it('handles unterminated string with escaped quotes, params and token cache eviction', () => {
        expect(tokenizeSql("'it''s")).toEqual([{ kind: 'string', value: "it's" }]);
        expect(tokenizeSql('$123 $1')).toEqual([
            { kind: 'param', index: 123 },
            { kind: 'param', index: 1 },
        ]);
        for (let i = 0; i <= 505; i++) {
            tokenizeSql(`select ${i}`);
        }
    });
});


describe('tokenizer cache and whitespace', () => {
    it('skips form feed and vertical tab whitespace', () => {
        expect(tokenizeSql('select\f1')).toEqual(tokenizeSql('select 1'));
        expect(tokenizeSql('select\v1')).toEqual(tokenizeSql('select 1'));
    });

    it('returns a fresh array per call so callers cannot corrupt the cache', () => {
        const first = tokenizeSql('select "x" from "t"');
        first.push({ kind: 'punct', value: 'X' });
        expect(tokenizeSql('select "x" from "t"').at(-1)).not.toEqual({ kind: 'punct', value: 'X' });
    });
});
