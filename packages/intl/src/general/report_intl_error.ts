import config from '../config/intl_config.js';

export default function reportIntlError(error: unknown, source: string): void {
    if (config.onError) {
        try {
            const res = config.onError(error, source);
            if (res && typeof (res as Promise<void>).catch === 'function') {
                (res as Promise<void>).catch(() => {});
            }
        } catch {
            // Swallow sink failure
        }
        return;
    }

    console.error('[cloudflare-next-intl-intl]', source, error);
}
