import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import StaleDeployScripts, { defaultReloadHtml } from './stale_deploy_scripts.js';
import { defaultStaleDeployPatterns } from './is_stale_deploy_error.js';

afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
});

describe('StaleDeployScripts', () => {
    it('with NODE_ENV=production renders scripts embedding patterns and BUILD_ID', () => {
        vi.stubEnv('NODE_ENV', 'production');
        const { container } = render(<StaleDeployScripts />);
        const earlyCatch = container.querySelector('#stale-deploy-early-catch');
        expect(earlyCatch).not.toBeNull();
        expect(earlyCatch?.textContent).toContain(JSON.stringify(defaultStaleDeployPatterns));
        expect(earlyCatch?.textContent).toContain(JSON.stringify(defaultReloadHtml));

        const buildId = container.querySelector('#build-id-script');
        expect(buildId).not.toBeNull();
        expect(buildId?.textContent).toContain("'/BUILD_ID'");
    });

    it('with NODE_ENV=development renders nothing', async () => {
        vi.stubEnv('NODE_ENV', 'development');
        const { container } = render(<StaleDeployScripts />);
        expect(container.innerHTML).toBe('');
    });

    it('renders custom reloadHtml when provided', () => {
        vi.stubEnv('NODE_ENV', 'production');
        const customHtml = '<p>custom spinner</p>';
        const { container } = render(<StaleDeployScripts reloadHtml={customHtml} />);
        const earlyCatch = container.querySelector('#stale-deploy-early-catch');
        expect(earlyCatch?.textContent).toContain(customHtml);
    });
});
