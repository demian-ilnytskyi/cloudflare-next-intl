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
        expect(tokenizeSql('a <> b >= c <= d != e')).toEqual([
            { kind: 'word', value: 'a' },
            { kind: 'punct', value: '<>' },
            { kind: 'word', value: 'b' },
            { kind: 'punct', value: '>=' },
            { kind: 'word', value: 'c' },
            { kind: 'punct', value: '<=' },
            { kind: 'word', value: 'd' },
            { kind: 'punct', value: '!=' },
            { kind: 'word', value: 'e' },
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
    });

    it('reads decimal numbers and unknown characters as punct', () => {
        expect(tokenizeSql('1.5 ;')).toEqual([
            { kind: 'number', value: '1.5' },
            { kind: 'punct', value: ';' },
        ]);
    });
});
