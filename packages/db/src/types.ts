/**
 * Local, trimmed copy of `cloudflare-next-intl`'s `RoutingConfig` types —
 * only the fields the db transport actually reads. Deliberately duplicated
 * rather than imported: this package has no dependency on
 * `cloudflare-next-intl` (that would be circular — the main package depends
 * on THIS one), and the main package's `src/types/types.ts` re-exports
 * `DbRoutingConfig`/`SupabaseDbConfig`/`FallibleConfigValue` from here
 * instead (see Task 11) so the two stay in sync at the type level.
 */

export type ConfigValue<T> = T | (() => T | Promise<T>);

/**
 * A {@link ConfigValue} whose function form may also return `null`/`undefined`
 * to mean "this source has nothing — fall through to the next one".
 */
export type FallibleConfigValue<T> = ConfigValue<T | null | undefined>;

export interface SupabaseDbConfig {
    /** Supabase project URL, e.g. `https://abc.supabase.co`. */
    url?: FallibleConfigValue<string>;
    /** Supabase anon (publishable) key — never a service-role key. */
    anonKey?: FallibleConfigValue<string>;
    /** Name of the Postgres function that runs generated SQL. Defaults to `'cfni_exec'`. */
    execFunction?: string;
    /** `false` when `cfni_exec` is not installed — see package README. Defaults to `true`. */
    rawSql?: boolean;
}

/**
 * Resolved from the caller's own auth system (e.g. Firebase Auth) by a
 * `DbConfig.resolveAuthUser` callback the CALLER supplies. This package
 * never resolves this itself — it has no auth SDK dependency at all.
 */
export interface AuthUserResolverResult {
    uid: string | null;
    getIdToken: (forceRefresh?: boolean) => Promise<string | null | undefined>;
    getIdTokenResult: () => Promise<{ claims: Record<string, unknown> }>;
}

export interface DbRoutingConfig {
    connectionString?: FallibleConfigValue<string>;
    autoHyperdrive?: boolean;
    autoHyperdriveSkipUrls?: string[];
    /** @deprecated Ignored since 0.8.23 — every call opens and closes its own client. */
    disconnectAfterRequest?: boolean;
    authenticatedRole?: string | (() => string | Promise<string>);
    authenticatedRoleClaim?: string | false;
    getUserId?: () => Promise<string | null> | string | null;
    getAccessToken?: () => Promise<string | null> | string | null;
    supabase?: SupabaseDbConfig;
}

/** The Cloudflare context slice the db transport and error reporter read. */
export interface CloudflareContext {
    env?: Record<string, unknown>;
    ctx?: { waitUntil?: (promise: Promise<unknown>) => void };
}

/** Matches `@opennextjs/cloudflare`'s overloaded `getCloudflareContext`. */
export interface GetCloudflareContext {
    (options: { async: true }): Promise<CloudflareContext | null | undefined>;
    (options?: { async: false }): CloudflareContext | null | undefined;
}

/** The slice of `GenerateRoutingConfig` the db transport reads. */
export interface GenerateRoutingConfig {
    env?: object | Record<string, unknown> | (() => object | Record<string, unknown> | Promise<object | Record<string, unknown>>);
    ctx?: { waitUntil?: (promise: Promise<unknown>) => void } | (() => { waitUntil?: (promise: Promise<unknown>) => void } | undefined);
    getCloudflareContext?: GetCloudflareContext;
}

/** The slice of `ErrorHandlingRoutingConfig` `report_error.ts` reads. */
export interface ErrorHandlingRoutingConfig {
    enable?: boolean;
    onError?: (params: ErrorHandlingParams) => void | Promise<void>;
    logToConsole?: boolean;
    ignoreConsoleErrors?: readonly string[];
    ignoreConsoleError?: (stringified: string) => boolean;
    dedup?: boolean;
    throttleMs?: number;
    resetDedup?: boolean;
}

export interface ErrorHandlingParams {
    error: unknown;
    classOrMethodName: string;
    params?: unknown;
    isClient?: boolean;
    consent?: boolean | undefined;
    formattedMessage?: string;
    dedupKey?: string;
}

/**
 * The config every `db` export reads. `resolveAuthUser` is this package's
 * only auth hook — supply it to back `withUserDb`'s uid/token/role
 * resolution with whatever auth system you use; omit it to require
 * `db.getUserId`/`db.getAccessToken`/an explicit credential instead.
 */
export interface DbConfig {
    db?: DbRoutingConfig;
    generate?: GenerateRoutingConfig;
    errorHandling?: ErrorHandlingRoutingConfig;
    resolveAuthUser?: () => Promise<AuthUserResolverResult | null>;
}
