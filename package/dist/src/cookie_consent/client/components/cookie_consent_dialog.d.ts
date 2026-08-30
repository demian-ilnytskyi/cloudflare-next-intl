import type { ConsentValue, CookieDialogClassNames, CookieDialogStyles } from '../../types.js';
export interface CookieConsentDialogProps {
    message?: React.ReactNode;
    link?: React.ReactNode;
    privacyPolicyLinkText?: string;
    showPrivacyPolicy?: boolean;
    acceptText?: string;
    declineText?: string;
    hideDecline?: boolean;
    id?: string;
    classNames?: CookieDialogClassNames;
    styles?: CookieDialogStyles;
    render?: (props: {
        setConsent: (value: ConsentValue) => void;
    }) => React.ReactNode;
}
export default function CookieConsentDialog({ message, link, privacyPolicyLinkText, showPrivacyPolicy, acceptText, declineText, hideDecline, id, classNames, styles, render, }: CookieConsentDialogProps): React.ReactElement | null;
