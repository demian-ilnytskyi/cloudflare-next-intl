import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import useAuthUser from './use_auth_user.js';
import { AuthUserContext } from './auth_user_provider.js';

function Consumer() {
    const ctx = useAuthUser();
    return <span>{ctx.loading ? 'loading' : ctx.user?.uid ?? 'no-user'}</span>;
}

describe('useAuthUser', () => {
    it('throws when rendered outside a provider', () => {
        expect(() => render(<Consumer />)).toThrow('useAuthUser must be used within an AuthUserProvider');
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
