/**
 * Auto-rendered alongside `FirebaseAuthClientProvider` when
 * `firebaseAuth.performance` isn't `false` — records Firebase Performance
 * custom traces for Web Vitals metrics (`web_cls`, `web_fcp`, `web_fid`,
 * `web_lcp`, `web_ttfb`, `web_inp`) and SPA route changes (`route_change`),
 * alongside Firebase Performance's own automatic page-load/network traces.
 * No-ops if `firebaseAuth.performance` is disabled (`getFirebasePerformanceSync`
 * never resolves an instance).
 */
export default function AutoFirebasePerformanceEvents(): null;
