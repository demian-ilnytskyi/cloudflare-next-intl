declare const dbEslintConfig: {
    rules: {
        'no-restricted-imports': (string | {
            paths: {
                name: string;
                message: string;
            }[];
            patterns: string[];
        })[];
    };
}[];
export default dbEslintConfig;
