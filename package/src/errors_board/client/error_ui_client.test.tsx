// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LocalTime, CopyButton, DetailBlock } from './error_ui_client.js';

describe('LocalTime', () => {
    it('renders blank before mount, then the formatted value after', async () => {
        render(<LocalTime format={(ms) => `formatted-${ms}`} timestampMs={1000} />);
        expect(await screen.findByText('formatted-1000')).toBeInTheDocument();
    });
});

describe('CopyButton', () => {
    it('copies the given text and shows the copied label', async () => {
        const writeText = vi.fn(async () => undefined);
        Object.assign(navigator, { clipboard: { writeText } });

        render(<CopyButton text="hello" />);
        fireEvent.click(screen.getByRole('button', { name: 'Copy' }));

        expect(writeText).toHaveBeenCalledWith('hello');
        await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('Copied'));
    });
});

describe('DetailBlock', () => {
    it('renders the label and text', () => {
        render(<DetailBlock label="Stack trace" text="at foo.bar" />);
        expect(screen.getByText('Stack trace')).toBeInTheDocument();
        expect(screen.getByText('at foo.bar')).toBeInTheDocument();
    });
});
