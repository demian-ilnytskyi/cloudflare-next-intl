export type SqlToken = {
    kind: 'word';
    value: string;
} | {
    kind: 'quoted';
    value: string;
} | {
    kind: 'string';
    value: string;
} | {
    kind: 'number';
    value: string;
} | {
    kind: 'param';
    index: number;
} | {
    kind: 'punct';
    value: string;
};
export default function tokenizeSql(sql: string): SqlToken[];
