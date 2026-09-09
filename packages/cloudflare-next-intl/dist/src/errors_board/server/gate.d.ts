export interface ErrorsAccessOptions {
    allowedEmails: readonly string[] | ((email: string | null) => boolean);
    onDenied?: () => void | Promise<void>;
}
export declare function createRequireErrorsAccess(options: ErrorsAccessOptions): () => Promise<void>;
export interface PasswordErrorsAccessOptions {
    password: string;
    cookieName?: string;
    cookiePath?: string;
    maxAgeSeconds?: number;
    onDenied?: () => void | Promise<void>;
}
export interface PasswordErrorsAccess {
    hasAccess(): Promise<boolean>;
    requireAccess(): Promise<void>;
    verifyPassword(password: string): Promise<boolean>;
    setAuthCookie(): Promise<void>;
}
export declare function createPasswordErrorsAccess(options: PasswordErrorsAccessOptions): PasswordErrorsAccess;
