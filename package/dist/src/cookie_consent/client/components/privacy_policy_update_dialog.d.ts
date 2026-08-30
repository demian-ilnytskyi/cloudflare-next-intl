import type { CookieDialogClassNames, CookieDialogStyles } from '../../types.js';
export interface PrivacyPolicyUpdateDialogProps {
    message?: React.ReactNode;
    link?: React.ReactNode;
    privacyPolicyLinkText?: string;
    showPrivacyPolicy?: boolean;
    closeText?: string;
    id?: string;
    classNames?: CookieDialogClassNames;
    styles?: CookieDialogStyles;
    render?: (props: {
        acknowledge: () => void;
    }) => React.ReactNode;
}
export default function PrivacyPolicyUpdateDialog({ message, link, privacyPolicyLinkText, showPrivacyPolicy, closeText, id, classNames, styles, render, }: PrivacyPolicyUpdateDialogProps): React.ReactElement | null;
