import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import useAuthUser from './use_auth_user';
import { AuthUserContext } from './auth_user_provider';

function Consumer() {
    const ctx = useAuthUser();
    return <span>{ctx.loading ? 'loading' : ctx.user?.uid ?? 'no-user'}</span>;
}

describe('useAuthUser', () => {
    it('returns the default context value when rendered outside a provider', () => {
        render(<Consumer />);
        expect(screen.getByText('loading')).toBeInTheDocument();
    });

    it('returns the value provided by AuthUserContext.Provider', () => {
        render(
            <AuthUserContext.Provider
                value={{
                    user: { uid: 'abc' } as never,
                    loading: false,
                    reloadUser: async () => {},
                    sendVerificationEmail: async () => {},
                    logout: async () => {},
                }}
            >
                <Consumer />
            </AuthUserContext.Provider>,
        );
        expect(screen.getByText('abc')).toBeInTheDocument();
    });
});
