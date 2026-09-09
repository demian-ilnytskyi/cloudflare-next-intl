import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useContext } from 'react';
import AuthUserPendingProvider from './auth_user_pending_provider.js';
import { AuthUserContext, type AuthUserContextType } from './auth_user_context.js';

function readContext(onValue: (value: AuthUserContextType) => void) {
    return function Consumer() {
        const value = useContext(AuthUserContext);
        onValue(value!);
        return <span>{`${value?.user?.uid ?? 'none'}:${value?.loading}`}</span>;
    };
}

describe('AuthUserPendingProvider', () => {
    it('publishes the seed state for a signed-out visitor with no initialUser prop', () => {
        let value: AuthUserContextType | undefined;
        const Consumer = readContext((next) => { value = next; });

        render(<AuthUserPendingProvider><Consumer /></AuthUserPendingProvider>);

        expect(screen.getByText('none:true')).toBeInTheDocument();
        expect(value).toBeDefined();
    });

    it('mirrors AuthUserProvider\'s seed for a server-resolved user', () => {
        let value: AuthUserContextType | undefined;
        const Consumer = readContext((next) => { value = next; });

        render(
            <AuthUserPendingProvider initialUser={{ uid: 'u1', email: 'a@b.c', emailVerified: true, displayName: null }}>
                <Consumer />
            </AuthUserPendingProvider>,
        );

        expect(screen.getByText('u1:false')).toBeInTheDocument();
        expect(value?.user).toMatchObject({ uid: 'u1' });
    });

    // The actions can't work before the SDK chunk exists; they reject rather
    // than resolving to a no-op so a caller can't mistake "still loading" for
    // "the action ran".
    it('rejects every action while the real provider is still loading', async () => {
        let value: AuthUserContextType | undefined;
        const Consumer = readContext((next) => { value = next; });

        render(<AuthUserPendingProvider><Consumer /></AuthUserPendingProvider>);

        await expect(value!.reloadUser()).rejects.toThrow('AuthUserProvider is still loading');
        await expect(value!.sendVerificationEmail()).rejects.toThrow('AuthUserProvider is still loading');
        await expect(value!.logout()).rejects.toThrow('AuthUserProvider is still loading');
    });
});
