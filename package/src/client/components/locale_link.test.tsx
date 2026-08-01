import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import LocaleLink from './locale_link';

vi.mock('../hooks/use_path_name', () => ({ default: () => '/about' }));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('') }));
vi.mock('../functions/set_cookie', () => ({ default: () => {} }));

describe('LocaleLink', () => {
    it('renders the resolved client link once Suspense resolves', async () => {
        render(<LocaleLink locale="de" className="nav-link">Go</LocaleLink>);
        expect(await screen.findByRole('link', { name: 'Go' })).toHaveAttribute('href', '/de/about');
    });
});
