#!/usr/bin/env node
// Verifies the oauthClientId/oauthClientSecret/oauthRefreshToken remote-signing
// path used by `mint_server_app_check_token.ts` when `privateKey` can't be
// created (e.g. iam.disableServiceAccountKeyCreation org policy). Run this
// before wiring the env vars into your app, to confirm the credentials and
// IAM grant actually work.
//
// Usage:
//   gcloud auth application-default login
//   SA_EMAIL=<clientEmail> node scripts/check_app_check_signjwt.mjs
//
// Reads client_id/client_secret/refresh_token from
// ~/.config/gcloud/application_default_credentials.json by default
// (override with ADC_PATH).

import { readFileSync } from 'node:fs';

const SA_EMAIL = process.env.SA_EMAIL;
if (!SA_EMAIL) {
    console.error('Set SA_EMAIL to the appCheck.clientEmail you intend to use.');
    process.exit(1);
}

const adcPath = process.env.ADC_PATH || `${process.env.HOME}/.config/gcloud/application_default_credentials.json`;
const adc = JSON.parse(readFileSync(adcPath, 'utf8'));
if (adc.type !== 'authorized_user') {
    console.error(`Expected an authorized_user ADC file (got type=${adc.type}). Run: gcloud auth application-default login`);
    process.exit(1);
}

console.log('[1/2] exchanging refresh_token for an access_token...');
const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
        client_id: adc.client_id,
        client_secret: adc.client_secret,
        refresh_token: adc.refresh_token,
        grant_type: 'refresh_token',
    }),
});
const tokenBody = await tokenRes.json();
if (!tokenRes.ok) {
    console.error('FAILED:', tokenRes.status, tokenBody);
    process.exit(1);
}
console.log('  ok — scopes:', tokenBody.scope);

console.log(`[2/2] calling iamcredentials.signJwt as ${SA_EMAIL}...`);
const signRes = await fetch(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${SA_EMAIL}:signJwt`,
    {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenBody.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: JSON.stringify({ probe: true, iat: Math.floor(Date.now() / 1000) }) }),
    },
);
const signBody = await signRes.json();

if (signRes.ok) {
    console.log('  ok — signJwt succeeded. No service-account key was created or needed.');
    console.log('\nSet these three on appCheck: oauthClientId, oauthClientSecret, oauthRefreshToken');
    console.log(`  oauthClientId     = ${adc.client_id}`);
    console.log(`  oauthClientSecret = ${adc.client_secret}`);
    console.log(`  oauthRefreshToken = ${adc.refresh_token}`);
} else {
    console.error('FAILED:', signRes.status, signBody);
    console.error('\nMost likely cause: the ADC identity lacks roles/iam.serviceAccountTokenCreator on', SA_EMAIL);
    console.error(`Fix: gcloud iam service-accounts add-iam-policy-binding ${SA_EMAIL} --member="user:<your-email>" --role="roles/iam.serviceAccountTokenCreator"`);
    process.exit(1);
}
