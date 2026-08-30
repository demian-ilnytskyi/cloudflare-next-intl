import reportError from './report_error.js';
import stringifyUnknown from './stringify_unknown.js';
export default function installGlobalErrorOverride(config) {
    const enabled = config?.errorHandling?.overrideWindowErrors ?? config?.errorHandling?.overrideConsoleError;
    if (enabled !== true)
        return;
    if (typeof window === 'undefined')
        return;
    if (window.__isGlobalErrorOverrideInstalled)
        return;
    window.__isGlobalErrorOverrideInstalled = true;
    window.addEventListener('error', (event) => {
        void reportError(config, {
            error: event.error ?? stringifyUnknown(event.message, true),
            classOrMethodName: 'Global Window Error Handler',
            isClient: true,
        });
    });
    window.addEventListener('unhandledrejection', (event) => {
        void reportError(config, {
            error: event.reason,
            classOrMethodName: 'Global Unhandled Rejection Handler',
            isClient: true,
        });
    });
}
