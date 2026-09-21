import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const server = readFileSync('server.ts', 'utf8');
const panel = readFileSync('src/pages/AdminPanel.tsx', 'utf8');
assert.match(server, /app\.get\("\/api\/admin\/professionals", requireAuth, requireAdmin/);
assert.match(server, /private, no-store/);
assert.match(server, /select\("id, google_email, full_name, photo_url, role, status, created_at/);
const routeStart = server.indexOf('app.get("/api/admin/professionals"');
const routeEnd = server.indexOf('app.post("/api/admin/professionals"');
const routeSnippet = server.slice(routeStart, routeEnd);
assert.doesNotMatch(routeSnippet, /tokens|secrets|provider credentials/i);
assert.match(panel, /fetch\('\/api\/admin\/professionals'/);
assert.doesNotMatch(panel, /const refreshProfessionals[\s\S]{0,500}\.from\('professionals'\)/);
console.log('admin professionals server endpoint and clinic-member visibility contract: PASS');
