# Changelog

## 0.2.0

### Added
- `intlMiddleware(request, options)` now accepts an `options.middlewareHandler`
  callback to run your own logic (auth, feature flags, etc.) alongside
  locale routing, and `options.runHandlerOnRedirect` to opt it into also
  running on locale redirects (default `false`).
- JSDoc added across all public exports (components, hooks, functions,
  types) for better editor autocomplete and AI-assistant usage.
- README: added a full "Setup" section documenting the required
  `@intl-config` alias wiring in `next.config` and middleware setup, plus
  usage examples for previously-undocumented exports.

### Notes
- `./getLayoutStates` export currently has no runtime implementation
  (disabled in source) — flagged in code, not fixed in this release.
