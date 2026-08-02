import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import CookieConsentDialog from './cookie_consent_dialog';

const setConsent = vi.fn();
let consent: boolean | null = null;
let isMounted = true;
let privacyPolicyPath: string | false = '/privacy-policy';
let locale: string | undefined = undefined;

vi.mock('../use_cookie_consent', () => ({
    default: () => ({ consent, isMounted, setConsent, privacyPolicyUpdated: false, acknowledgePrivacyPolicyUpdate: vi.fn(), privacyPolicyPath }),
}));

vi.mock('../../../general/cache_variables', () => ({
    getLocaleCache: () => locale,
}));

vi.mock('./default_privacy_policy_link', () => ({
    default: ({ privacyPolicyPath: path, text }: { privacyPolicyPath: string | false; text: string }) =>
        path === false ? null : <a href={path} data-testid="default-privacy-policy-link">{text}</a>,
}));

describe('CookieConsentDialog', () => {
    beforeEach(() => {
        consent = null;
        isMounted = true;
        privacyPolicyPath = '/privacy-policy';
        locale = undefined;
        setConsent.mockClear();
    });

    it('renders null once consent is decided (true)', () => {
        consent = true;
        const { container } = render(<CookieConsentDialog />);
        expect(container).toBeEmptyDOMElement();
    });

    it('renders null before the client has mounted, even with consent still null', () => {
        isMounted = false;
        const { container } = render(<CookieConsentDialog />);
        expect(container).toBeEmptyDOMElement();
    });

    it('renders null once consent is decided (false / necessary-only)', () => {
        consent = false;
        const { container } = render(<CookieConsentDialog />);
        expect(container).toBeEmptyDOMElement();
    });

    it('renders the default banner with accept/decline buttons and calls setConsent', () => {
        render(<CookieConsentDialog link={<a href="/privacy">Privacy</a>} />);
        expect(screen.getByText('Privacy')).toBeInTheDocument();
        screen.getByText('Accept').click();
        expect(setConsent).toHaveBeenCalledWith(true);
        screen.getByText('Necessary only').click();
        expect(setConsent).toHaveBeenCalledWith(false);
    });

    it('renders with no link override, classNames, or styles provided', () => {
        render(<CookieConsentDialog />);
        expect(document.querySelector('#cookie-consent-dialog')).toBeInTheDocument();
        expect(screen.queryByText('Privacy')).not.toBeInTheDocument();
    });

    it('renders the default privacy-policy link when link is omitted', () => {
        render(<CookieConsentDialog />);
        expect(screen.getByTestId('default-privacy-policy-link')).toHaveTextContent('Privacy Policy');
    });

    it('respects a custom privacyPolicyLinkText for the default link', () => {
        render(<CookieConsentDialog privacyPolicyLinkText="See policy" />);
        expect(screen.getByTestId('default-privacy-policy-link')).toHaveTextContent('See policy');
    });

    it('renders no link at all when privacyPolicyPath is false and link is omitted', () => {
        privacyPolicyPath = false;
        render(<CookieConsentDialog />);
        expect(screen.queryByTestId('default-privacy-policy-link')).not.toBeInTheDocument();
    });

    it('renders no link when link is explicitly null, even with a configured privacyPolicyPath', () => {
        render(<CookieConsentDialog link={null} />);
        expect(screen.queryByTestId('default-privacy-policy-link')).not.toBeInTheDocument();
    });

    it('applies classNames and styles per slot', () => {
        render(
            <CookieConsentDialog
                link={<a href="/privacy">Privacy</a>}
                classNames={{
                    root: 'root-class',
                    message: 'message-class',
                    link: 'link-class',
                    actions: 'actions-class',
                    acceptButton: 'accept-class',
                    declineButton: 'decline-class',
                }}
                styles={{
                    root: { color: 'red' },
                    message: { color: 'blue' },
                    link: { color: 'green' },
                    actions: { color: 'yellow' },
                    acceptButton: { color: 'pink' },
                    declineButton: { color: 'purple' },
                }}
            />,
        );
        expect(document.getElementById('cookie-consent-dialog')).toHaveClass('root-class');
        expect(screen.getByText('Accept')).toHaveClass('accept-class');
        expect(screen.getByText('Necessary only')).toHaveClass('decline-class');
    });

    it('hides the decline button when hideDecline is set', () => {
        render(<CookieConsentDialog hideDecline />);
        expect(screen.queryByText('Necessary only')).not.toBeInTheDocument();
    });

    it('supports custom text props', () => {
        render(<CookieConsentDialog message="custom message" acceptText="Yes" declineText="No" />);
        expect(screen.getByText('custom message')).toBeInTheDocument();
        expect(screen.getByText('Yes')).toBeInTheDocument();
        expect(screen.getByText('No')).toBeInTheDocument();
    });

    it('uses Ukrainian default text when locale is uk', () => {
        locale = 'uk';
        render(<CookieConsentDialog />);
        expect(screen.getByText('Прийняти')).toBeInTheDocument();
        expect(screen.getByText('Тільки необхідні')).toBeInTheDocument();
    });

    it('falls back to English default text for an unsupported locale', () => {
        locale = 'fr';
        render(<CookieConsentDialog />);
        expect(screen.getByText('Accept')).toBeInTheDocument();
    });

    it('uses the render prop to bypass the default markup', () => {
        render(
            <CookieConsentDialog
                render={({ setConsent: sc }) => <button onClick={() => sc(true)}>custom-accept</button>}
            />,
        );
        expect(screen.queryByText('Accept')).not.toBeInTheDocument();
        screen.getByText('custom-accept').click();
        expect(setConsent).toHaveBeenCalledWith(true);
    });
});
