import type { NextResponse } from 'next/server';
import type { Languages } from 'next/dist/lib/metadata/types/alternative-urls-types';
import type { Videos } from 'next/dist/lib/metadata/types/metadata-types';
import type { CookieConsentDialogProps } from '../cookie_consent/client/components/cookie_consent_dialog.js';
import type { PrivacyPolicyUpdateDialogProps } from '../cookie_consent/client/components/privacy_policy_update_dialog.js';
import type { ConsentValue } from '../cookie_consent/types.js';
import type { User } from '@firebase/auth';
export type MiddlewareCustomHandler = (locale: string, rewriteUrl: URL | undefined, redirectUrl: URL | undefined) => NextResponse<unknown> | null | Promise<NextResponse<unknown> | null>;
export type Locales = readonly string[];
export type LocalePrefixMode = 'always' | 'as-needed' | 'never';
export interface RoutingConfig<AppLocales extends Locales, AppLocalePrefixMode extends LocalePrefixMode> {
    locales: AppLocales;
    defaultLocale: string;
    localePrefix?: AppLocalePrefixMode;
    localeCookie?: false | CookieAttributes;
    localeDetection?: boolean;
    firebaseAuth?: FirebaseAuthRoutingConfig;
    db?: DbRoutingConfig;
    cookieConsent?: CookieConsentRoutingConfig;
    generate?: GenerateRoutingConfig;
    errorHandling?: ErrorHandlingRoutingConfig;
}
export interface GenerateRoutingConfig {
    env?: object | Record<string, unknown> | (() => object | Record<string, unknown> | Promise<object | Record<string, unknown>>);
    ctx?: {
        waitUntil?: (promise: Promise<unknown>) => void;
    } | (() => {
        waitUntil?: (promise: Promise<unknown>) => void;
    } | undefined);
    getCloudflareContext?: CookieConsentGetCloudflareContext;
    countryHeaderNames?: readonly string[];
    timezoneHeaderNames?: readonly string[];
}
export type RequestOrHeaders = Request | Headers | {
    headers?: Headers | Record<string, string | null | undefined>;
    cf?: {
        country?: string;
        timezone?: string;
        [key: string]: unknown;
    };
} | undefined;
export interface ErrorHandlingParams {
    error: unknown;
    classOrMethodName: string;
    params?: unknown;
    isClient?: boolean;
    consent?: ConsentValue;
    formattedMessage?: string;
    dedupKey?: string;
}
export interface ErrorHandlingRoutingConfig {
    enable?: boolean;
    onError?: (params: ErrorHandlingParams) => void | Promise<void>;
    logToConsole?: boolean;
    overrideConsoleError?: boolean;
    suppressClientConsoleError?: boolean;
    ignoreConsoleErrors?: readonly string[];
    staleDeployPatterns?: readonly string[];
    ignoreConsoleError?: (message: string) => boolean;
    overrideWindowErrors?: boolean;
    dedup?: boolean;
    throttleMs?: number;
    resetDedup?: boolean;
}
export interface CookieConsentRoutingConfig {
    privacyPolicyDate?: string | Date;
    privacyPolicyPath?: string | false;
    showPrivacyPolicy?: boolean;
    consentCookieName?: string;
    privacyPolicyDateCookieName?: string;
    cookieMaxAge?: number;
    autoWireAnalytics?: boolean;
    analytics?: CookieConsentAnalyticsConfig;
    getAnalytics?: () => CookieConsentAnalyticsConfig | Promise<CookieConsentAnalyticsConfig>;
    autoAnalyticsEvents?: AutoAnalyticsEventsConfig;
    getCountryCode?: () => string | undefined | Promise<string | undefined>;
    countryHeaderNames?: readonly string[];
    gdprCountries?: readonly string[];
    enableAnalyticsInDevMode?: boolean;
    autoWireDialogs?: boolean;
    dialogProps?: CookieConsentDialogProps;
    updateDialogProps?: PrivacyPolicyUpdateDialogProps;
}
export interface CookieConsentCloudflareContext {
    cf?: Record<string, unknown>;
    ctx?: {
        waitUntil?: (promise: Promise<unknown>) => void;
    };
}
export interface CookieConsentGetCloudflareContext {
    (options: {
        async: true;
    }): Promise<CookieConsentCloudflareContext | null>;
    (options?: {
        async: false;
    }): CookieConsentCloudflareContext | null;
}
export type AutoAnalyticsEventName = 'screen_view' | 'web_cls' | 'web_fcp' | 'web_fid' | 'web_lcp' | 'web_ttfb' | 'web_inp';
export interface AutoAnalyticsEventsConfig {
    events?: readonly AutoAnalyticsEventName[];
    getScreenName?: (path: string) => string;
}
export interface CookieConsentAnalyticsConfig {
    cloudflareBeaconToken?: string;
    googleAnalyticsId?: string;
    googleAdsId?: string;
    googleAdSenseId?: string;
    clarityProjectId?: string;
}
export interface FirebaseAuthRoutingConfig {
    middlewareEnabled?: boolean;
    autoWireClientProvider?: boolean;
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket?: string;
    messagingSenderId?: string;
    appId: string;
    measurementId?: string;
    performance?: boolean;
    appCheck?: FirebaseAppCheckConfig;
    redirectAuthPath: string;
    homePath: string;
    verifyEmailPath?: string;
    resetPasswordPath?: string;
    recoverEmailPath?: string;
    signInPath?: string;
    actionModePaths?: Readonly<Record<string, string>>;
    actionLinkRedirectEnabled?: boolean;
    followSameOriginContinueUrl?: boolean;
    actionLinkPath?: string;
    stripActionLinkQuery?: boolean;
    preserveRedirectQuery?: boolean;
    isAuthPath: (path: string) => boolean;
    whiteListPaths?: readonly string[];
    sessionCookieMaxAge?: number;
    refreshTokenCookieMaxAge?: number;
    sessionCookieName?: string;
    refreshTokenCookieName?: string;
    emailVerifiedHintCookieName?: string;
    appCheckTokenCookieName?: string;
    appCheckTokenCookieMaxAge?: number;
    onSignIn?: (user: User) => void | Promise<void>;
    onEmailVerified?: (user: User) => void | Promise<void>;
    onSignOut?: () => void | Promise<void>;
}
export interface FirebaseAppCheckConfig {
    recaptchaV3SiteKey?: string;
    recaptchaEnterpriseSiteKey?: string;
    useExplicitRecaptchaScript?: boolean;
    debugToken?: boolean | string;
    isTokenAutoRefreshEnabled?: boolean;
    clientEmail: string;
    privateKey?: string;
    oauthClientId?: string;
    oauthClientSecret?: string;
    oauthRefreshToken?: string;
    appId: string;
}
export interface CookieAttributes {
    domain?: string | undefined;
    encode?(value: string): string;
    expires?: Date | undefined;
    httpOnly?: boolean | undefined;
    maxAge?: number | undefined;
    partitioned?: boolean | undefined;
    path?: string | undefined;
    priority?: "low" | "medium" | "high" | undefined;
    sameSite?: true | false | "lax" | "strict" | "none" | undefined;
    secure?: boolean | undefined;
}
export type TranslationEntry = string | TranslationObject | TranslationEntry[];
export interface TranslationObject {
    [key: string]: TranslationEntry;
}
export type ReturnType = string;
export interface TranslatorReturnType {
    (key: string): ReturnType;
    raw(key: string): TranslationEntry;
}
export type changeFrequency = 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never' | undefined;
export type Alternates = {
    languages?: Languages<string> | undefined;
} | undefined;
export interface IntlSitemap {
    link?: string;
    changeFrequency?: changeFrequency;
    priority?: number | undefined;
    images?: string[] | undefined;
    lastModified: Date | string | undefined;
    videos?: Videos[] | undefined;
}
export type ConfigValue<T> = T | (() => T | Promise<T>);
export type FallibleConfigValue<T> = ConfigValue<T | null | undefined>;
export interface SupabaseDbConfig {
    url?: FallibleConfigValue<string>;
    anonKey?: FallibleConfigValue<string>;
    execFunction?: string;
    rawSql?: boolean;
}
export interface DbRoutingConfig {
    connectionString?: FallibleConfigValue<string>;
    disconnectAfterRequest?: boolean;
    authenticatedRole?: string | (() => string | Promise<string>);
    authenticatedRoleClaim?: string | false;
    getUserId?: () => Promise<string | null> | string | null;
    disconnectTimeoutMs?: number;
    supabase?: SupabaseDbConfig;
    getAccessToken?: () => Promise<string | null> | string | null;
}
