'use client';
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useTransition } from 'react';
export default function ErrorsLoginForm({ login, onSuccess, title = 'Error log', }) {
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const [isPending, startTransition] = useTransition();
    function handleSubmit(event) {
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
    return (_jsxs("main", { className: "mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4", children: [_jsx("h1", { className: "text-lg font-semibold text-gray-900 dark:text-white", children: title }), _jsxs("form", { onSubmit: handleSubmit, className: "flex flex-col gap-2", children: [_jsx("input", { type: "password", autoFocus: true, value: password, onChange: (event) => setPassword(event.target.value), placeholder: "Password", className: "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white" }), error && _jsx("p", { className: "text-xs text-red-600 dark:text-red-400", children: error }), _jsx("button", { type: "submit", disabled: isPending, className: "rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50", children: "Enter" })] })] }));
}
