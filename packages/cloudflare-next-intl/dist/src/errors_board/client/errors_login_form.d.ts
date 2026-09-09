export default function ErrorsLoginForm({ login, onSuccess, title, }: {
    login: (password: string) => Promise<boolean>;
    onSuccess: () => void;
    title?: string;
}): Component;
