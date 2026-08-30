import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import DefaultPrivacyPolicyLink from './default_privacy_policy_link.js';

vi.mock('../../../general/cache_variables', () => ({ getLocaleCache: vi.fn() }));

afterEach(() => {
    cleanup();
});

describe('DefaultPrivacyPolicyLink', () => {
    it('renders null when privacyPolicyPath is false', () => {
        const { container } = render(<DefaultPrivacyPolicyLink privacyPolicyPath={false} text="Privacy Policy" />);
        expect(container).toBeEmptyDOMElement();
    });

    it('prepends the locale segment for a non-default cached locale', async () => {
        const { getLocaleCache } = await import('../../../general/cache_variables.js');
        vi.mocked(getLocaleCache).mockReturnValue('de');
        render(<DefaultPrivacyPolicyLink privacyPolicyPath="/privacy-policy" text="Privacy Policy" />);
        expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/de/privacy-policy');
    });

    it('does not prepend a locale segment for the default cached locale', async () => {
        const { getLocaleCache } = await import('../../../general/cache_variables.js');
        vi.mocked(getLocaleCache).mockReturnValue('en');
        render(<DefaultPrivacyPolicyLink privacyPolicyPath="/privacy-policy" text="Privacy Policy" />);
        expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy-policy');
    });

    it('prepends a locale segment when no locale is cached at all', async () => {
        const { getLocaleCache } = await import('../../../general/cache_variables.js');
        vi.mocked(getLocaleCache).mockReturnValue(undefined);
        render(<DefaultPrivacyPolicyLink privacyPolicyPath="/privacy-policy" text="Privacy Policy" />);
        expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/undefined/privacy-policy');
    });

    it('applies className and style', async () => {
        const { getLocaleCache } = await import('../../../general/cache_variables.js');
        vi.mocked(getLocaleCache).mockReturnValue('en');
        render(
            <DefaultPrivacyPolicyLink
                privacyPolicyPath="/privacy-policy"
                text="Privacy Policy"
                className="link-class"
                style={{ color: 'red' }}
            />,
        );
        expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveClass('link-class');
    });
});
