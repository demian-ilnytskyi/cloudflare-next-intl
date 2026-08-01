'use client';

import { useContext } from 'react';
import { AuthUserContext } from './auth_user_provider';

/** Reads the current Firebase auth user and its actions from AuthUserProvider's context. */
export default function useAuthUser() {
    return useContext(AuthUserContext);
}
