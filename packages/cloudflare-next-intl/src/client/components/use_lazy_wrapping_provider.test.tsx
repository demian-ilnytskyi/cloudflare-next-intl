import { describe, it, expect } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import useLazyWrappingProvider from './use_lazy_wrapping_provider.js';

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => {
        resolve = r;
    });
    return { promise, resolve };
}

function Harness({ loader }: { loader: () => Promise<{ default: React.ComponentType<{ children?: React.ReactNode }> }> }) {
    const { Provider, isReady } = useLazyWrappingProvider(loader);
    return <>
        <span data-testid="is-ready">{String(isReady)}</span>
        <Provider><span>child</span></Provider>
    </>;
}

describe('useLazyWrappingProvider', () => {
    it('renders children immediately, before the loader resolves, with isReady false', () => {
        const { promise } = deferred<{ default: React.ComponentType<{ children?: React.ReactNode }> }>();
        const loader = () => promise;

        render(<Harness loader={loader} />);

        expect(screen.getByText('child')).toBeInTheDocument();
        expect(screen.queryByTestId('resolved-provider')).not.toBeInTheDocument();
        expect(screen.getByTestId('is-ready')).toHaveTextContent('false');
    });

    it('wraps children in the resolved component once the loader resolves, without unmounting them, and flips isReady to true', async () => {
        const { promise, resolve } = deferred<{ default: React.ComponentType<{ children?: React.ReactNode }> }>();
        const loader = () => promise;

        render(<Harness loader={loader} />);
        expect(screen.getByText('child')).toBeInTheDocument();

        const Resolved = ({ children }: { children?: React.ReactNode }) => (
            <div data-testid="resolved-provider">{children}</div>
        );
        await act(async () => resolve({ default: Resolved }));

        expect(await screen.findByTestId('resolved-provider')).toBeInTheDocument();
        expect(screen.getByText('child')).toBeInTheDocument();
        expect(screen.getByTestId('is-ready')).toHaveTextContent('true');
    });

    it('never lets children disappear from the DOM across the pending-to-resolved transition', async () => {
        // This is the actual white-screen regression: children must never be
        // absent from the document at any point, not even momentarily.
        const { promise, resolve } = deferred<{ default: React.ComponentType<{ children?: React.ReactNode }> }>();
        const loader = () => promise;

        render(<Harness loader={loader} />);
        expect(screen.queryByText('child')).toBeInTheDocument();

        const Resolved = ({ children }: { children?: React.ReactNode }) => (
            <div data-testid="resolved-provider">{children}</div>
        );

        const resolution = act(async () => resolve({ default: Resolved }));
        // Even mid-flight, before the act() flush completes, nothing should
        // have removed the children from the document.
        expect(screen.queryByText('child')).toBeInTheDocument();
        await resolution;
        expect(screen.queryByText('child')).toBeInTheDocument();
    });

    it('returns a stable Provider identity across renders for the same loader', () => {
        const { promise } = deferred<{ default: React.ComponentType<{ children?: React.ReactNode }> }>();
        const loader = () => promise;

        const seen: unknown[] = [];
        function Probe() {
            const { Provider } = useLazyWrappingProvider(loader);
            seen.push(Provider);
            return <Provider><span>x</span></Provider>;
        }

        const { rerender } = render(<Probe />);
        rerender(<Probe />);
        rerender(<Probe />);

        expect(seen.length).toBe(3);
        expect(seen[0]).toBe(seen[1]);
        expect(seen[1]).toBe(seen[2]);
    });
});
