import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import PrivacyPolicyUpdateDialog from './privacy_policy_update_dialog';

const acknowledgePrivacyPolicyUpdate = vi.fn();
let privacyPolicyUpdated = false;

vi.mock('../use_cookie_consent', () => ({
    default: () => ({ consent: true, setConsent: vi.fn(), privacyPolicyUpdated, acknowledgePrivacyPolicyUpdate }),
}));

describe('PrivacyPolicyUpdateDialog', () => {
    beforeEach(() => {
        privacyPolicyUpdated = false;
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

    it('renders with no link, classNames, or styles provided', () => {
        privacyPolicyUpdated = true;
        const { container } = render(<PrivacyPolicyUpdateDialog />);
        expect(container.querySelector('#privacy-policy-update-dialog')).toBeInTheDocument();
        expect(screen.queryByText('Privacy')).not.toBeInTheDocument();
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
