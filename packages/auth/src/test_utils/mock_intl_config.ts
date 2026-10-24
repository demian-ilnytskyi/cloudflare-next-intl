const mockIntlConfig = {
    locales: ['en', 'uk'] as const,
    defaultLocale: 'en',
    firebaseAuth: {
        apiKey: 'test-api-key',
        authDomain: 'test.firebaseapp.com',
        projectId: 'test-project',
        appId: '1:123456789:web:abcdef',
        redirectAuthPath: '/login',
        homePath: '/',
    },
};

export default mockIntlConfig;
