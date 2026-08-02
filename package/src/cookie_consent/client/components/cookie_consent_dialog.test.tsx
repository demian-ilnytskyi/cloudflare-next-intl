import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import CookieConsentDialog from './cookie_consent_dialog';

const setConsent = vi.fn();
let consent: boolean | null = null;

vi.mock('../use_cookie_consent', () => ({
    default: () => ({ consent, setConsent, privacyPolicyUpdated: false, acknowledgePrivacyPolicyUpdate: vi.fn() }),
}));

describe('CookieConsentDialog', () => {
    beforeEach(() => {
        consent = null;
        setConsent.mockClear();
    });

    it('renders null once consent is decided', () => {
        consent = true;
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

    it('renders with no link, classNames, or styles provided', () => {
        const { container } = render(<CookieConsentDialog />);
        expect(container.querySelector('#cookie-consent-dialog')).toBeInTheDocument();
        expect(screen.queryByText('Privacy')).not.toBeInTheDocument();
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
