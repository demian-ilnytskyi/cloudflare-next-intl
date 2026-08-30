import { jsx as _jsx } from "react/jsx-runtime";
import { bench, describe } from 'vitest';
import { renderHook } from '@testing-library/react';
import useAuthUser from './use_auth_user.js';
import { AuthUserContext } from './auth_user_provider.js';
describe('useAuthUser (client)', () => {
    bench('reads a provided context value', () => {
        renderHook(() => useAuthUser(), {
            wrapper: ({ children }) => (_jsx(AuthUserContext.Provider, { value: {
                    user: { uid: 'bench-user' },
                    loading: false,
                    reloadUser: async () => { },
                    sendVerificationEmail: async () => { },
                    logout: async () => { },
                }, children: children })),
        });
    });
});
