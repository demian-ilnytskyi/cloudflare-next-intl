export interface CookieConsentDefaultText {
    message: string;
    privacyPolicyLinkText: string;
    acceptText: string;
    declineText: string;
}

export interface PrivacyPolicyUpdateDefaultText {
    message: string;
    privacyPolicyLinkText: string;
    closeText: string;
}

export const defaultCookieConsentText: Record<string, CookieConsentDefaultText> = {
    en: {
        message: 'We use cookies to improve your experience.',
        privacyPolicyLinkText: 'Privacy Policy',
        acceptText: 'Accept',
        declineText: 'Necessary only',
    },
    uk: {
        message: 'Ми використовуємо файли cookie, щоб покращити ваш досвід.',
        privacyPolicyLinkText: 'Політика конфіденційності',
        acceptText: 'Прийняти',
        declineText: 'Тільки необхідні',
    },
};

export const defaultPrivacyPolicyUpdateText: Record<string, PrivacyPolicyUpdateDefaultText> = {
    en: {
        message: 'Our privacy policy has been updated.',
        privacyPolicyLinkText: 'Learn more',
        closeText: 'Got it',
    },
    uk: {
        message: 'Нашу політику конфіденційності було оновлено.',
        privacyPolicyLinkText: 'Дізнатися більше',
        closeText: 'Зрозуміло',
    },
};
