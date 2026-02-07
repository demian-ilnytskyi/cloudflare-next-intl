# Package Maintenance Guide

This guide explains how to update and publish the `cloudflare-next-intl`
package.

## 1. Make your changes

Edit the source code in the `src` directory.

## 2. Bump the version

Before publishing, you must increase the version number in
`package/package.json`:

```bash
# Example: bump to 0.1.1
npm version patch
```

## 3. Build the package

Ensure the `dist` folder is up to date:

```bash
npm run build
```

## 4. Publish to npm

Since you have 2FA (Two-Factor Authentication) enabled, you must run the publish
command yourself from your terminal:

```bash
npm publish --access public
```

_Note: npm will prompt you for your 2FA code during this step._

---

## Technical Summary

- **Build Tool**: `tsc` (TypeScript Compiler)
- **Format**: ESM-only (standard for modern Next.js environments)
- **Files included**: `dist`, `README.md`, `LICENSE`
