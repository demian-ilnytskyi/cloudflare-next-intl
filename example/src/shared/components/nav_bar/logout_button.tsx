"use client";

import useAuthUser from "cloudflare-next-intl/useFirebaseAuthUser";

interface LogoutButtonProps {
    text: string;
    className?: string;
}

export default function LogoutButton({ text, className }: LogoutButtonProps) {
    const { user, loading, logout } = useAuthUser();

    if (loading || !user) return null;

    return (
        <button
            type="button"
            onClick={logout}
            className={className}
        >
            {text}
        </button>
    );
}
