import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const readBearerToken = (req: VercelRequest) => {
  const authorization = String(req.headers.authorization || '').trim();
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
};

const callN8n = async (
  webhookUrl: string,
  internalToken: string,
  payload: Record<string, unknown>,
  timeoutMs: number
) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${internalToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const rawResponse = await response.text();
    let body: Record<string, unknown> = {};

    try {
      body = rawResponse ? JSON.parse(rawResponse) : {};
    } catch {
      body = {};
    }

    return { response, body };
  } finally {
    clearTimeout(timeout);
  }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const accessToken = readBearerToken(req);
  if (!accessToken) {
    return res.status(401).json({ ok: false, error: 'authentication_required' });
  }

  const round = Number(req.query.round || 2);
  if (round !== 2) {
    return res.status(400).json({ ok: false, error: 'unsupported_round' });
  }

  const supabaseUrl = String(process.env.VITE_SUPABASE_URL || '').trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[CampaignDashboard] Supabase server-side não configurado.');
    return res.status(503).json({ ok: false, error: 'server_configuration_missing' });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
  const user = authData?.user;

  if (authError || !user) {
    return res.status(401).json({ ok: false, error: 'invalid_session' });
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('professionals')
    .select('role,status')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    console.error('[CampaignDashboard] Falha ao validar perfil administrativo:', profileError.message);
    return res.status(503).json({ ok: false, error: 'admin_validation_failed' });
  }

  if (profile?.role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'admin_only' });
  }

  const webhookUrl = String(process.env.EVOLUCAO_CLINICA_BATCH_DISPATCH_WEBHOOK_URL || '').trim();
  const internalToken = String(process.env.EVOLUCAO_CLINICA_BATCH_DISPATCH_TOKEN || '').trim();

  if (!webhookUrl || !internalToken) {
    console.error('[CampaignDashboard] Webhook/token interno do n8n não configurado.');
    return res.status(503).json({ ok: false, error: 'dispatch_integration_not_configured' });
  }

  try {
    const { response: n8nResponse, body: n8nBody } = await callN8n(
      webhookUrl,
      internalToken,
      { action: 'dashboard_round2' },
      55_000
    );

    if (!n8nResponse.ok) {
      console.error('[CampaignDashboard] n8n recusou consulta do dashboard.', {
        status: n8nResponse.status
      });
      return res.status(502).json({
        ok: false,
        error: 'n8n_dashboard_rejected',
        upstream_status: n8nResponse.status
      });
    }

    if (n8nBody.ok !== true) {
      return res.status(502).json({
        ok: false,
        error: typeof n8nBody.error === 'string' ? n8nBody.error : 'n8n_dashboard_unavailable'
      });
    }

    return res.status(200).json(n8nBody);
  } catch (error) {
    const isAbort = error instanceof Error && error.name === 'AbortError';
    console.error('[CampaignDashboard] Falha ao consultar dashboard no n8n.', {
      error: isAbort ? 'timeout' : error instanceof Error ? error.message : 'unknown_error'
    });
    return res.status(502).json({
      ok: false,
      error: isAbort ? 'n8n_dashboard_timeout' : 'n8n_dashboard_unavailable'
    });
  }
}
