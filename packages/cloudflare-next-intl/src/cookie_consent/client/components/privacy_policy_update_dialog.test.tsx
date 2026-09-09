import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import PrivacyPolicyUpdateDialog from './privacy_policy_update_dialog.js';

const acknowledgePrivacyPolicyUpdate = vi.fn();
let privacyPolicyUpdated = false;
let privacyPolicyPath: string | false = '/privacy-policy';
let showPrivacyPolicy = true;
let locale: string | undefined = undefined;

vi.mock('../use_cookie_consent', () => ({
    default: () => ({ consent: true, setConsent: vi.fn(), privacyPolicyUpdated, acknowledgePrivacyPolicyUpdate, privacyPolicyPath, showPrivacyPolicy }),
}));

vi.mock('../../../general/cache_variables', () => ({
    getLocaleCache: () => locale,
}));

vi.mock('./default_privacy_policy_link', () => ({
    default: ({ privacyPolicyPath: path, text }: { privacyPolicyPath: string | false; text: string }) =>
        path === false ? null : <a href={path} data-testid="default-privacy-policy-link">{text}</a>,
}));

describe('PrivacyPolicyUpdateDialog', () => {
    beforeEach(() => {
        privacyPolicyUpdated = false;
        privacyPolicyPath = '/privacy-policy';
        showPrivacyPolicy = true;
        locale = undefined;
        acknowledgePrivacyPolicyUpdate.mockClear();
    });

    it('renders null when there is no update', () => {
        const { container } = render(<PrivacyPolicyUpdateDialog />);
        expect(container).toBeEmptyDOMElement();
    });

    it('renders the default banner and calls acknowledge on close', () => {
        privacyPolicyUpdated = true;
        render(<PrivacyPolicyUpdateDialog link={<a href="/privacy">Privacy</a>} />);
        expect(screen.getByText('Privacy')).toBeInTheDocument();
        screen.getByText('Got it').click();
        expect(acknowledgePrivacyPolicyUpdate).toHaveBeenCalled();
    });

    it('renders with no link override, classNames, or styles provided', () => {
        privacyPolicyUpdated = true;
        render(<PrivacyPolicyUpdateDialog />);
        expect(document.querySelector('#privacy-policy-update-dialog')).toBeInTheDocument();
        expect(screen.queryByText('Privacy')).not.toBeInTheDocument();
    });

    it('renders the default privacy-policy link when link is omitted', () => {
        privacyPolicyUpdated = true;
        render(<PrivacyPolicyUpdateDialog />);
        expect(screen.getByTestId('default-privacy-policy-link')).toHaveTextContent('Learn more');
    });

    it('renders no link when showPrivacyPolicy is false on context', () => {
        privacyPolicyUpdated = true;
        showPrivacyPolicy = false;
        render(<PrivacyPolicyUpdateDialog />);
        expect(screen.queryByTestId('default-privacy-policy-link')).not.toBeInTheDocument();
    });

    it('renders no link when showPrivacyPolicy prop is false', () => {
        privacyPolicyUpdated = true;
        render(<PrivacyPolicyUpdateDialog showPrivacyPolicy={false} />);
        expect(screen.queryByTestId('default-privacy-policy-link')).not.toBeInTheDocument();
    });

    it('renders link when showPrivacyPolicy prop is true even if context is false', () => {
        privacyPolicyUpdated = true;
        showPrivacyPolicy = false;
        render(<PrivacyPolicyUpdateDialog showPrivacyPolicy={true} />);
        expect(screen.getByTestId('default-privacy-policy-link')).toBeInTheDocument();
    });

    it('respects a custom privacyPolicyLinkText for the default link', () => {
        privacyPolicyUpdated = true;
        render(<PrivacyPolicyUpdateDialog privacyPolicyLinkText="See policy" />);
        expect(screen.getByTestId('default-privacy-policy-link')).toHaveTextContent('See policy');
    });

    it('renders no link at all when privacyPolicyPath is false and link is omitted', () => {
        privacyPolicyUpdated = true;
        privacyPolicyPath = false;
        render(<PrivacyPolicyUpdateDialog />);
        expect(screen.queryByTestId('default-privacy-policy-link')).not.toBeInTheDocument();
    });

    it('renders no link when link is explicitly null, even with a configured privacyPolicyPath', () => {
        privacyPolicyUpdated = true;
        render(<PrivacyPolicyUpdateDialog link={null} />);
        expect(screen.queryByTestId('default-privacy-policy-link')).not.toBeInTheDocument();
    });

    it('applies classNames and styles per slot', () => {
        privacyPolicyUpdated = true;
        render(
            <PrivacyPolicyUpdateDialog
                link={<a href="/privacy">Privacy</a>}
                classNames={{ root: 'root-class', message: 'message-class', link: 'link-class', closeButton: 'close-class' }}
                styles={{
                    root: { color: 'red' },
                    message: { color: 'blue' },
                    link: { color: 'green' },
                    closeButton: { color: 'pink' },
                }}
            />,
        );
        expect(document.getElementById('privacy-policy-update-dialog')).toHaveClass('root-class');
        expect(screen.getByText('Got it')).toHaveClass('close-class');
    });

    it('supports custom text props', () => {
        privacyPolicyUpdated = true;
        render(<PrivacyPolicyUpdateDialog message="custom message" closeText="Close" />);
        expect(screen.getByText('custom message')).toBeInTheDocument();
        expect(screen.getByText('Close')).toBeInTheDocument();
    });

    it('uses Ukrainian default text when locale is uk', () => {
        privacyPolicyUpdated = true;
        locale = 'uk';
        render(<PrivacyPolicyUpdateDialog />);
        expect(screen.getByText('Зрозуміло')).toBeInTheDocument();
    });

    it('falls back to English default text for an unsupported locale', () => {
        privacyPolicyUpdated = true;
        locale = 'fr';
        render(<PrivacyPolicyUpdateDialog />);
        expect(screen.getByText('Got it')).toBeInTheDocument();
    });

    it('uses the render prop to bypass the default markup', () => {
        privacyPolicyUpdated = true;
        render(
            <PrivacyPolicyUpdateDialog
                render={({ acknowledge }) => <button onClick={acknowledge}>custom-ack</button>}
            />,
        );
        expect(screen.queryByText('Got it')).not.toBeInTheDocument();
        screen.getByText('custom-ack').click();
        expect(acknowledgePrivacyPolicyUpdate).toHaveBeenCalled();
    });
});
