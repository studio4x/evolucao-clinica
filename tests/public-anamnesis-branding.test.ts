import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasActivePublicBrandingAccess, safePublicBrandLogoUrl } from '../server/anamnesisLinkForms';

const supabaseUrl = 'https://kvxboovgrrhhttaqinld.supabase.co';
const validLogo = `${supabaseUrl}/storage/v1/object/public/brand/custom_logos/qa/logo.png`;
assert.equal(hasActivePublicBrandingAccess({ subscription_plan: 'yearly', subscription_status: 'active' }), true);
assert.equal(hasActivePublicBrandingAccess({ subscription_plan: 'monthly', subscription_status: 'active' }), false);
assert.equal(hasActivePublicBrandingAccess({ subscription_plan: 'yearly', subscription_status: 'canceled' }), false);
assert.equal(hasActivePublicBrandingAccess({ subscription_plan: 'yearly', subscription_status: 'active', subscription_ends_at: '2020-01-01T00:00:00.000Z' }), false);
assert.equal(safePublicBrandLogoUrl(validLogo, supabaseUrl), validLogo);
assert.equal(safePublicBrandLogoUrl('https://example.com/logo.png', supabaseUrl), null);
assert.equal(safePublicBrandLogoUrl(`${supabaseUrl}/storage/v1/object/public/other/logo.png`, supabaseUrl), null);
assert.equal(safePublicBrandLogoUrl('http://kvxboovgrrhhttaqinld.supabase.co/storage/v1/object/public/brand/custom_logos/logo.png', supabaseUrl), null);

const serverSource = readFileSync('server/anamnesisLinkForms.ts', 'utf8');
const pageSource = readFileSync('src/pages/PublicAnamnesisForm.tsx', 'utf8');
const logoSource = readFileSync('src/pages/CustomLogo.tsx', 'utf8');
assert.match(serverSource, /subscription_plan, subscription_status, subscription_ends_at, custom_logo_url/);
assert.match(serverSource, /branding: publicContext\.branding/);
assert.match(serverSource, /storage\/v1\/object\/public\/brand\/custom_logos/);
assert.doesNotMatch(serverSource, /branding:.*subscription_plan/);
assert.match(pageSource, /alt="Logotipo do profissional"/);
assert.match(pageSource, /onError=\{\(\) => setLogoUnavailable\(true\)\}/);
assert.match(pageSource, /Evolução Clínica/);
assert.match(logoSource, /Seu logotipo também aparecerá nas Anamneses enviadas para preenchimento\./);

console.log('public anamnesis branding tests passed');
