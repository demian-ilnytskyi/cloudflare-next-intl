export type RawSqlResolution = {
    status: 'true' | 'false';
    reason: string;
} | {
    status: 'unknown';
    reason: string;
};
export default function resolveRawSql(cwd: string): RawSqlResolution;
