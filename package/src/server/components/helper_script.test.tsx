import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import HelperScript from './helper_script';

vi.mock('../../client/components/client_helper_script', () => ({ default: () => null }));

afterEach(() => {
    cleanup();
});

describe('HelperScript', () => {
    it('renders the app-state-checker script and the build-id script outside dev', () => {
        vi.stubEnv('NODE_ENV', 'production');
        const { container: root } = render(<HelperScript />);
        expect(root.querySelector('#intl-app-state-checker')).not.toBeNull();
        expect(root.querySelector('#build-id-script')).not.toBeNull();
        vi.unstubAllEnvs();
    });

    it('omits the build-id script in dev', async () => {
        vi.resetModules();
        vi.stubEnv('NODE_ENV', 'development');
        const { default: DevHelperScript } = await import('./helper_script');
        const { container: root } = render(<DevHelperScript />);
        expect(root.querySelector('#build-id-script')).toBeNull();
        expect(root.querySelector('#intl-app-state-checker')).not.toBeNull();
        vi.unstubAllEnvs();
    });
});
