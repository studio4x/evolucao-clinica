import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const ALLOWED_SHEETS = new Set([
  'Terapia Ocupacional',
  'Enfermagem - Home Care',
  'Área não confirmada',
  'Psicologia e Saúde Mental',
  'Fisioterapia',
  'Teste'
]);

const ALLOWED_TEMPLATES = new Set([
  'convite_jornada_ec_15dias_v1',
  'convite_jornada_ec_organizacao_v2',
  'convite_jornada_evolucao_clinica'
]);

const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,100}$/;

const readBearerToken = (req: VercelRequest) => {
  const authorization = String(req.headers.authorization || '').trim();
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
};

const parseBody = (body: unknown): Record<string, unknown> => {
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    return body as Record<string, unknown>;
  }

  if (typeof body === 'string' && body.trim()) {
    try {
      const parsed = JSON.parse(body);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
    } catch {
      return {};
    }
  }

  return {};
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

  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const accessToken = readBearerToken(req);
  if (!accessToken) {
    return res.status(401).json({ ok: false, error: 'authentication_required' });
  }

  const supabaseUrl = String(process.env.VITE_SUPABASE_URL || '').trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[CampaignDispatch] Supabase server-side não configurado.');
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
    console.error('[CampaignDispatch] Falha ao validar perfil administrativo:', profileError.message);
    return res.status(503).json({ ok: false, error: 'admin_validation_failed' });
  }

  if (profile?.role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'admin_only' });
  }

  const webhookUrl = String(process.env.EVOLUCAO_CLINICA_BATCH_DISPATCH_WEBHOOK_URL || '').trim();
  const internalToken = String(process.env.EVOLUCAO_CLINICA_BATCH_DISPATCH_TOKEN || '').trim();

  if (!webhookUrl || !internalToken) {
    console.error('[CampaignDispatch] Webhook/token interno do n8n não configurado.');
    return res.status(503).json({ ok: false, error: 'dispatch_integration_not_configured' });
  }

  if (req.method === 'GET') {
    const requestId = String(req.query.request_id || '').trim();

    if (!REQUEST_ID_PATTERN.test(requestId)) {
      return res.status(400).json({ ok: false, error: 'invalid_request_id' });
    }

    try {
      const { response: n8nResponse, body: n8nBody } = await callN8n(
        webhookUrl,
        internalToken,
        {
          action: 'status',
          request_id: requestId
        },
        12_000
      );

      if (!n8nResponse.ok) {
        console.error('[CampaignDispatch] n8n recusou consulta de status.', {
          status: n8nResponse.status,
          requestId
        });
        return res.status(502).json({
          ok: false,
          error: 'n8n_status_rejected',
          request_id: requestId,
          upstream_status: n8nResponse.status
        });
      }

      return res.status(200).json(n8nBody);
    } catch (error) {
      const isAbort = error instanceof Error && error.name === 'AbortError';
      console.error('[CampaignDispatch] Falha ao consultar status no n8n.', {
        requestId,
        error: isAbort ? 'timeout' : error instanceof Error ? error.message : 'unknown_error'
      });
      return res.status(502).json({
        ok: false,
        error: isAbort ? 'n8n_status_timeout' : 'n8n_status_unavailable',
        request_id: requestId
      });
    }
  }

  const payload = parseBody(req.body);
  const sheet = String(payload.sheet || '').trim();
  const template = String(payload.template || '').trim();
  const quantity = Number(payload.quantity);
  const confirmed = payload.confirmed === true;

  if (!ALLOWED_SHEETS.has(sheet)) {
    return res.status(400).json({ ok: false, error: 'invalid_sheet' });
  }

  if (!ALLOWED_TEMPLATES.has(template)) {
    return res.status(400).json({ ok: false, error: 'invalid_template' });
  }

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
    return res.status(400).json({ ok: false, error: 'invalid_quantity' });
  }

  if (!confirmed) {
    return res.status(400).json({ ok: false, error: 'confirmation_required' });
  }

  const requestId = randomUUID();

  try {
    const { response: n8nResponse, body: n8nBody } = await callN8n(
      webhookUrl,
      internalToken,
      {
        action: 'dispatch',
        request_id: requestId,
        aba_origem: sheet,
        max_disparos_lote: quantity,
        template_name: template
      },
      15_000
    );

    if (!n8nResponse.ok) {
      console.error('[CampaignDispatch] n8n recusou a solicitação.', {
        status: n8nResponse.status,
        requestId
      });
      return res.status(502).json({
        ok: false,
        error: 'n8n_rejected_request',
        request_id: requestId,
        upstream_status: n8nResponse.status
      });
    }

    return res.status(202).json({
      ok: true,
      accepted: true,
      request_id: requestId,
      sheet,
      quantity,
      template,
      workflow: typeof n8nBody.workflow === 'string' ? n8nBody.workflow : undefined,
      poll_after_ms: 5000
    });
  } catch (error) {
    const isAbort = error instanceof Error && error.name === 'AbortError';
    console.error('[CampaignDispatch] Falha ao acionar n8n.', {
      requestId,
      error: isAbort ? 'timeout' : error instanceof Error ? error.message : 'unknown_error'
    });
    return res.status(502).json({
      ok: false,
      error: isAbort ? 'n8n_timeout' : 'n8n_unavailable',
      request_id: requestId
    });
  }
}
