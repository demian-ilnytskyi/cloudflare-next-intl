import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import ClientHelperScript from './client_helper_script';

vi.mock('../functions/get_cookie', () => ({
    default: vi.fn(),
}));

describe('ClientHelperScript', () => {
    beforeEach(() => {
        document.documentElement.classList.remove('dark');
    });

    it('renders nothing', () => {
        const { container } = render(<ClientHelperScript />);
        expect(container).toBeEmptyDOMElement();
    });

    it('adds the dark class when the cookie says dark is true', async () => {
        const getCookie = (await import('../functions/get_cookie')).default;
        vi.mocked(getCookie).mockReturnValue('true');
        render(<ClientHelperScript />);
        expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('does not toggle the class when it already matches the cookie', async () => {
        const getCookie = (await import('../functions/get_cookie')).default;
        vi.mocked(getCookie).mockReturnValue('false');
        document.documentElement.classList.remove('dark');
        render(<ClientHelperScript />);
        expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
});
