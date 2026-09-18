// Stage project only. --enable temporarily enables the two application gates;
// default restores every external/application gate to OFF and redeploys.
import assert from 'node:assert/strict';
import { loadRuntime } from './clinic-preproduction-runtime.js';

const runtime = loadRuntime();
const enabled = process.argv.includes('--enable');
const sha = process.env.F6_COMMIT;
assert.match(sha || '', /^[0-9a-f]{40}$/);
async function api(path: string, method = 'GET', body?: unknown) {
  const response = await fetch(`https://api.vercel.com${path}${path.includes('?') ? '&' : '?'}teamId=${runtime.teamId}`, {
    method, headers: { Authorization: `Bearer ${runtime.vercelToken}`, 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    throw new Error(`staging_vercel_${response.status}_${failure.error?.code || 'unknown'}_${String(failure.error?.message || '').replace(/[\r\n]/g, ' ').slice(0, 160)}`);
  }
  const text = await response.text(); return text ? JSON.parse(text) : {};
}
const project = await api(`/v9/projects/${runtime.projectId}`);
assert.equal(project.name, 'evolucao-clinica-staging');
const alias = await api('/v4/aliases/staging.evolucaoclinica.app.br');
const baseline = await api(`/v13/deployments/${alias.deployment?.id || alias.deploymentId}`);
assert.equal(baseline.projectId, runtime.projectId);
const variables = await api(`/v10/projects/${runtime.projectId}/env`);
const flags = ['CLINIC_FEATURE_ENABLED', 'VITE_CLINIC_FEATURE_ENABLED', 'CLINIC_INVITATION_DELIVERY_ENABLED', 'CLINIC_BILLING_ENABLED', 'GOOGLE_INTEGRATIONS_ENABLED', 'VITE_GOOGLE_INTEGRATIONS_ENABLED'];
for (const key of flags) {
  const value = enabled && ['CLINIC_FEATURE_ENABLED', 'VITE_CLINIC_FEATURE_ENABLED'].includes(key) ? 'true' : 'false';
  const existing = variables.envs.find((row: any) => row.key === key && row.target.includes('production'));
  if (existing) await api(`/v9/projects/${runtime.projectId}/env/${existing.id}`, 'PATCH', { value });
  else await api(`/v10/projects/${runtime.projectId}/env`, 'POST', { key, value, type: 'plain', target: ['production'] });
}
const deployment = await api('/v13/deployments', 'POST', {
  name: project.name, project: runtime.projectId,
  // "production" is the deployment target of the expressly authorized STAGING project.
  target: 'production', gitSource: { type: 'github', repoId: baseline.gitSource?.repoId || project.link?.repoId, ref: 'feat/clinicas', sha },
});
assert.equal(deployment.projectId, runtime.projectId);
console.log(JSON.stringify({ staging: true, projectId: runtime.projectId, deploymentId: deployment.id, flags: enabled ? 'CLINIC_APP_TEMPORARILY_ON_EXTERNAL_OFF' : 'ALL_OFF', sha }));
