export default async function clearClientCache() {
    try {
        if (typeof window !== 'undefined' && 'caches' in window && window.caches) {
            const keys = await caches.keys();
            await Promise.all(keys.map((key) => caches.delete(key)));
        }
        if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && navigator.serviceWorker) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map((registration) => registration.unregister()));
        }
        if (typeof sessionStorage !== 'undefined') {
            sessionStorage.clear();
        }
    }
    catch {
        // best-effort cleanup, ignore failures
    }
}
