'use client';
import { useContext } from 'react';
import { AuthUserContext } from './auth_user_provider.js';
export default function useAuthUser() {
    const context = useContext(AuthUserContext);
    if (context === null) {
        throw new Error('useAuthUser must be used within an AuthUserProvider');
    }
    return context;
}
