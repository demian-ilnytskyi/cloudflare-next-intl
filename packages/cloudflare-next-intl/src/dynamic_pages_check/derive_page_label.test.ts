import { describe, it, expect } from 'vitest';
import { derivePageLabel, deriveRoute, isApiRoute, makePageLabeler } from './derive_page_label.js';

const APP_DIR = '/repo/src/app';

describe('derivePageLabel', () => {
    it('title-cases a plain kebab-case leaf', () => {
        expect(derivePageLabel(APP_DIR, `${APP_DIR}/accept-invite/page.tsx`)).toBe('Accept Invite');
    });

    it('splits a snake_case or camelCase leaf into separate words', () => {
        expect(derivePageLabel(APP_DIR, `${APP_DIR}/account_type_gate/page.tsx`)).toBe('Account Type Gate');
        expect(derivePageLabel(APP_DIR, `${APP_DIR}/accountTypeGate/page.tsx`)).toBe('Account Type Gate');
    });

    it('drops route groups from the label entirely', () => {
        expect(derivePageLabel(APP_DIR, `${APP_DIR}/[locale]/(app)/privacy-policy/page.tsx`)).toBe('Privacy Policy');
    });

    it('appends a dynamic segment below the literal name as a (:param) suffix', () => {
        expect(derivePageLabel(APP_DIR, `${APP_DIR}/[locale]/(app)/property-profile/[ownerId]/page.tsx`))
            .toBe('Property Profile (:ownerId)');
        expect(derivePageLabel(APP_DIR, `${APP_DIR}/errors/[id]/page.tsx`)).toBe('Errors (:id)');
    });

    it('uses the deepest literal segment when static segments surround a dynamic one', () => {
        expect(derivePageLabel(APP_DIR, `${APP_DIR}/api/account-type-gate/route.ts`)).toBe('Account Type Gate');
    });

    it('falls back to "Home" for a route with no literal segment at all', () => {
        expect(derivePageLabel(APP_DIR, `${APP_DIR}/[locale]/page.tsx`)).toBe('Home');
        expect(derivePageLabel(APP_DIR, `${APP_DIR}/page.tsx`)).toBe('Home');
    });

    it('resets the dynamic suffix once a later literal segment appears', () => {
        expect(derivePageLabel(APP_DIR, `${APP_DIR}/[locale]/audit/[propertyId]/results/page.tsx`)).toBe('Results');
    });
});

describe('deriveRoute', () => {
    it('keeps every segment, converting brackets to a leading colon', () => {
        expect(deriveRoute(APP_DIR, `${APP_DIR}/[locale]/(app)/property-profile/[ownerId]/page.tsx`))
            .toBe('/:locale/property-profile/:ownerId');
    });

    it('drops route groups but keeps their siblings in order', () => {
        expect(deriveRoute(APP_DIR, `${APP_DIR}/[locale]/(auth)/login/page.tsx`)).toBe('/:locale/login');
    });

    it('renders a catch-all segment with a leading "..."', () => {
        expect(deriveRoute(APP_DIR, `${APP_DIR}/[locale]/docs/[...slug]/page.tsx`)).toBe('/:locale/docs/:...slug');
    });

    it('returns "/" for the app root', () => {
        expect(deriveRoute(APP_DIR, `${APP_DIR}/page.tsx`)).toBe('/');
    });
});

describe('isApiRoute', () => {
    it('is true only for route.ts/route.js, never page.*', () => {
        expect(isApiRoute('/repo/src/app/api/account-type-gate/route.ts')).toBe(true);
        expect(isApiRoute('/repo/src/app/api/e2e/audits/[id]/route.js')).toBe(true);
        expect(isApiRoute('/repo/src/app/[locale]/page.tsx')).toBe(false);
    });
});

describe('makePageLabeler', () => {
    const displayPath = (file: string) => `PATH:${file}`;

    it('defaults to the title style when no style is given', () => {
        const label = makePageLabeler(APP_DIR, undefined, displayPath);
        expect(label(`${APP_DIR}/accept-invite/page.tsx`)).toBe('Accept Invite');
    });

    it('falls back to the given displayPath function for style "path"', () => {
        const label = makePageLabeler(APP_DIR, 'path', displayPath);
        expect(label(`${APP_DIR}/accept-invite/page.tsx`)).toBe(`PATH:${APP_DIR}/accept-invite/page.tsx`);
    });

    it('calls a custom function with (file, appDir)', () => {
        const label = makePageLabeler(APP_DIR, (file, dir) => `${dir}::${file}`, displayPath);
        expect(label(`${APP_DIR}/x/page.tsx`)).toBe(`${APP_DIR}::${APP_DIR}/x/page.tsx`);
    });
});
