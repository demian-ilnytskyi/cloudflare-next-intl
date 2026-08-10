"use client";

import useAuthUser from "cloudflare-next-intl/useFirebaseAuthUser";

export default function ClientUserEmail() {
    const { user, loading } = useAuthUser();

    if (loading) return <p>Client email: loading...</p>;

    return <p>Client email: {user?.email ?? "not signed in"}</p>;
}
