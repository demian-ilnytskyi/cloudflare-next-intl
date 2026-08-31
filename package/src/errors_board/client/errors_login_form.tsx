'use client';

import { useState, useTransition } from 'react';

/**
 * The login screen for `createPasswordErrorsAccess`'s shared-password gate.
 * Pass your own `"use server"` login action (verify the password, then set
 * the auth cookie) as `login`; `onSuccess` runs after a successful login —
 * typically `router.refresh()`, so the board re-renders past the gate.
 */
export default function ErrorsLoginForm({
    login,
    onSuccess,
    title = 'Error log',
}: {
    login: (password: string) => Promise<boolean>;
    onSuccess: () => void;
    title?: string;
}): Component {
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    function handleSubmit(event: React.FormEvent): void {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
            const ok = await login(password);
            if (!ok) {
                setError('Wrong password');
                return;
            }
            onSuccess();
        });
    }

    return (
        <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4">
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h1>
            <form onSubmit={handleSubmit} className="flex flex-col gap-2">
                <input
                    type="password"
                    autoFocus
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Password"
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
                {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
                <button
                    type="submit"
                    disabled={isPending}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                    Enter
                </button>
            </form>
        </main>
    );
}
