import { bench, describe } from 'vitest';
import installConsoleErrorOverride from './install_console_error_override.js';
describe('installConsoleErrorOverride: repeated install calls (no-op after first)', () => {
    const originalConsoleError = console.error;
    console.error = () => { };
    bench('install() called repeatedly (marker check short-circuits)', () => {
        installConsoleErrorOverride({ errorHandling: { overrideConsoleError: true } });
    });
    console.error = originalConsoleError;
});
