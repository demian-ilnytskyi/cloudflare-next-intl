"use client";

import { useActionState } from "react";
import { createLoginAction } from "cloudflare-next-intl/firebaseAuthActions";
import { cn } from "@/lib/utils";

interface LoginFormProps {
    locale: string;
    emailLabel: string;
    passwordLabel: string;
    submitLabel: string;
}

export default function LoginForm({ locale, emailLabel, passwordLabel, submitLabel }: LoginFormProps) {
    const [state, action, pending] = useActionState(createLoginAction(locale, {}), {});

    return (
        <form action={action} className="flex flex-col gap-4 w-full max-w-sm">
            <label className="flex flex-col gap-1">
                <span>{emailLabel}</span>
                <input
                    type="email"
                    name="email"
                    required
                    className={cn(
                        "rounded-md border px-3 py-2",
                        "dark:bg-gray-800 dark:border-gray-600",
                    )}
                />
            </label>
            <label className="flex flex-col gap-1">
                <span>{passwordLabel}</span>
                <input
                    type="password"
                    name="password"
                    required
                    className={cn(
                        "rounded-md border px-3 py-2",
                        "dark:bg-gray-800 dark:border-gray-600",
                    )}
                />
            </label>
            {state.error && <p className="text-red-500">{state.error}</p>}
            <button
                type="submit"
                disabled={pending}
                className={cn(
                    "rounded-md bg-blue-600 text-white px-4 py-2",
                    "hover:bg-blue-700 disabled:opacity-50",
                )}
            >
                {submitLabel}
            </button>
        </form>
    );
}
