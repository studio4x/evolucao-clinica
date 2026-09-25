import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AnamnesisTemplateSchema } from '../src/services/anamnesisSchema.js';

type UserRequest = Request & { user?: { id: string } };
type AuthMiddleware = (req: Request, res: Response, next: NextFunction) => unknown;
type FieldError = { fieldId: string; message: string };

const FEATURE_FLAG = 'PATIENT_ANAMNESIS_LINK_FORMS_ENABLED';
const SESSION_TTL_SECONDS = 30 * 60;
const DEFAULT_EXPIRY_HOURS = 7 * 24;
const MIN_EXPIRY_HOURS = 24;
const MAX_EXPIRY_HOURS = 30 * 24;
const MAX_FIELDS = 120;
const MAX_SHORT_TEXT = 2_000;
const MAX_LONG_TEXT = 10_000;
const MAX_ANSWERS_BYTES = 300_000;
const PUBLIC_ERROR = 'Não foi possível acessar este formulário.';

const isFeatureEnabled = () => process.env[FEATURE_FLAG] === 'true';
const jsonBytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value ?? null), 'utf8');
const trimString = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const sessionSecret = () => createHash('sha256')
  .update(`${process.env.PATIENT_ANAMNESIS_LINK_SESSION_SECRET || ''}:${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`)
  .digest();

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
export const hashToken = (token: string) => sha256(token);

const encode = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
const decodeJson = (value: string) => JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<string, unknown>;

const createPublicSession = (requestId: string, expiresAt: string) => {
  const maxExpiry = Math.floor(new Date(expiresAt).getTime() / 1000);
  const exp = Math.min(Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS, maxExpiry);
  const payload = encode({ rid: requestId, exp, nonce: randomBytes(12).toString('base64url') });
  const signature = createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
};

const readPublicSession = (value: string | undefined) => {
  if (!value) return null;
  const [payload, signature] = value.split('.');
  if (!payload || !signature) return null;
  const expected = createHmac('sha256', sessionSecret()).update(payload).digest();
  const received = Buffer.from(signature, 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const data = decodeJson(payload);
    if (typeof data.rid !== 'string' || typeof data.exp !== 'number' || data.exp <= Math.floor(Date.now() / 1000)) return null;
    return { requestId: data.rid, expiresAt: data.exp };
  } catch {
    return null;
  }
};

const getIpKey = (req: Request) => {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : req.ip || req.socket.remoteAddress || 'unknown';
  return sha256(`${ip}:${sessionSecret().toString('hex')}`);
};

const applyPublicHeaders = (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
};

const unavailable = (res: Response, status = 404) => res.status(status).json({ error: PUBLIC_ERROR, code: 'unavailable' });

const firstName = (value: unknown) => trimString(value).split(/\s+/).filter(Boolean)[0] || 'profissional';
const initials = (value: unknown) => trimString(value)
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 3)
  .map((part) => `${Array.from(part)[0]?.toUpperCase() || ''}.`)
  .join(' ');

type PublicBranding = { logo?: string };

export const hasActivePublicBrandingAccess = (professional: any) => {
  if (professional?.role === 'admin' || professional?.subscription_plan === 'none') return true;
  const eligiblePlan = professional?.subscription_plan === 'yearly' || professional?.subscription_plan === 'courtesy';
  const activeStatus = professional?.subscription_status === 'active' || professional?.subscription_status === 'trialing';
  const endsAt = professional?.subscription_ends_at ? Date.parse(String(professional.subscription_ends_at)) : null;
  return eligiblePlan && activeStatus && (endsAt === null || Number.isNaN(endsAt) || endsAt >= Date.now());
};

export const safePublicBrandLogoUrl = (value: unknown, supabaseUrl: string) => {
  const rawUrl = trimString(value);
  if (!rawUrl) return null;
  try {
    const parsed = new URL(rawUrl);
    const expectedOrigin = new URL(supabaseUrl).origin;
    if (parsed.protocol !== 'https:' || parsed.origin !== expectedOrigin) return null;
    if (!parsed.pathname.startsWith('/storage/v1/object/public/brand/custom_logos/')) return null;
    return parsed.toString();
  } catch {
    return null;
  }
};

const getPublicBranding = (professional: any, supabaseUrl: string): PublicBranding => {
  if (!hasActivePublicBrandingAccess(professional)) return {};
  const logo = safePublicBrandLogoUrl(professional?.custom_logo_url, supabaseUrl);
  return logo ? { logo } : {};
};

const getFields = (snapshot: any) => (Array.isArray(snapshot?.sections) ? snapshot.sections : []).flatMap((section: any) =>
  (Array.isArray(section?.fields) ? section.fields : []).map((field: any) => ({ section, field }))
);

const fieldAnswerKey = (field: any) => String(field.id || field.key);

export const validateAnswers = (snapshot: any, answers: unknown, requireRequired: boolean): { valid: boolean; errors: FieldError[] } => {
  if (!isObject(answers) || jsonBytes(answers) > MAX_ANSWERS_BYTES) {
    return { valid: false, errors: [{ fieldId: '_form', message: 'Não foi possível processar as respostas.' }] };
  }
  const fields = getFields(snapshot);
  const allowed = new Set(fields.map(({ field }) => fieldAnswerKey(field)));
  const errors: FieldError[] = [];
  Object.keys(answers).forEach((key) => {
    if (!allowed.has(key)) errors.push({ fieldId: key, message: 'Campo não permitido.' });
  });
  fields.forEach(({ field }) => {
    const fieldId = fieldAnswerKey(field);
    const present = Object.prototype.hasOwnProperty.call(answers, fieldId);
    const value = (answers as any)[fieldId];
    const empty = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
    if (requireRequired && field.required && empty) {
      errors.push({ fieldId, message: 'Este campo é obrigatório.' });
      return;
    }
    if (!present || empty) return;
    switch (field.type) {
      case 'text':
        if (typeof value !== 'string' || value.length > MAX_SHORT_TEXT) errors.push({ fieldId, message: 'Use um texto mais curto.' });
        break;
      case 'textarea':
        if (typeof value !== 'string' || value.length > MAX_LONG_TEXT) errors.push({ fieldId, message: 'Use um texto mais curto.' });
        break;
      case 'date': {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) errors.push({ fieldId, message: 'Informe uma data válida.' });
        break;
      }
      case 'number':
      case 'scale': {
        if (typeof value !== 'number' || !Number.isFinite(value) || (field.min !== undefined && value < Number(field.min)) || (field.max !== undefined && value > Number(field.max))) errors.push({ fieldId, message: 'Informe um número válido.' });
        break;
      }
      case 'select':
        if (typeof value !== 'string' || !Array.isArray(field.options) || !field.options.includes(value)) errors.push({ fieldId, message: 'Selecione uma opção válida.' });
        break;
      case 'multiselect':
        if (!Array.isArray(value) || value.length > 50 || new Set(value).size !== value.length || value.some((item) => typeof item !== 'string' || !Array.isArray(field.options) || !field.options.includes(item))) errors.push({ fieldId, message: 'Selecione apenas opções válidas.' });
        break;
      case 'yes_no':
        if (typeof value !== 'boolean') errors.push({ fieldId, message: 'Escolha Sim ou Não.' });
        break;
      default:
        errors.push({ fieldId, message: 'Tipo de campo não permitido.' });
    }
  });
  return { valid: errors.length === 0, errors };
};

const toPublicField = (raw: any) => {
  const field: Record<string, unknown> = {
    id: String(raw.id || raw.key),
    key: String(raw.key || raw.id),
    label: trimString(raw.label).slice(0, 240),
    type: raw.type,
    required: raw.required === true,
    order: Number.isFinite(raw.order) ? raw.order : 0,
  };
  for (const key of ['placeholder', 'helpText', 'options', 'min', 'max']) {
    if (raw[key] !== undefined) field[key] = raw[key];
  }
  if (raw.patientReference) field.patientReference = String(raw.patientReference);
  return field;
};

export const buildSnapshot = (definition: any, input: { fieldIds?: unknown; sectionIds?: unknown; templateVersionId: string; templateName: string; versionNumber: number }) => {
  const sections = Array.isArray(definition?.sections) ? definition.sections : [];
  const requestedFields = Array.isArray(input.fieldIds) ? input.fieldIds.filter((value): value is string => typeof value === 'string') : [];
  const requestedSections = Array.isArray(input.sectionIds) ? input.sectionIds.filter((value): value is string => typeof value === 'string') : [];
  const allFields = getFields({ sections });
  const knownFields = new Set(allFields.map(({ field }) => fieldAnswerKey(field)));
  const knownSections = new Set(sections.map((section: any) => String(section.id || section.key)));
  if (requestedFields.length > MAX_FIELDS || requestedSections.length > sections.length) throw new Error('selection_limit');
  if (requestedFields.some((id) => !knownFields.has(id)) || requestedSections.some((id) => !knownSections.has(id))) throw new Error('selection_invalid');
  const explicitSelection = requestedFields.length > 0 || requestedSections.length > 0;
  const selected = sections.map((section: any) => {
    const sectionId = String(section.id || section.key);
    const sectionSelected = !explicitSelection || requestedSections.includes(sectionId) || (Array.isArray(section.fields) && section.fields.some((field: any) => requestedFields.includes(fieldAnswerKey(field))));
    const fields = (Array.isArray(section.fields) ? section.fields : []).filter((field: any) => {
      const id = fieldAnswerKey(field);
      return sectionSelected && (!explicitSelection || requestedSections.includes(sectionId) || requestedFields.includes(id));
    }).map(toPublicField);
    return { id: sectionId, key: String(section.key || sectionId), title: trimString(section.title).slice(0, 240), description: trimString(section.description).slice(0, 500) || undefined, order: section.order || 0, kind: section.kind || 'standard', fields };
  }).filter((section: any) => section.fields.length > 0);
  if (selected.length === 0 || selected.reduce((total: number, section: any) => total + section.fields.length, 0) > MAX_FIELDS) throw new Error('selection_empty');
  return { schemaVersion: 1, templateVersionId: input.templateVersionId, templateName: input.templateName, versionNumber: input.versionNumber, sections: selected };
};

const timestampToEpochMs = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
};

export const isRequestExpired = (request: any, nowMs = Date.now()) => {
  const expiresAtMs = timestampToEpochMs(request?.expires_at);
  return expiresAtMs === null || nowMs >= expiresAtMs;
};

export const statusFor = (request: any, response: any, incorporated: boolean, nowMs = Date.now()) => {
  if (request.revoked_at) return 'revoked';
  if (incorporated) return 'incorporated';
  if (request.submitted_at || response?.submitted_at) return 'responded';
  if (isRequestExpired(request, nowMs)) return 'expired';
  if ((response?.revision || 0) > 0 || response?.respondent_name || response?.respondent_relationship) return 'in_progress';
  return 'awaiting';
};

const statusLabel: Record<string, string> = {
  awaiting: 'Aguardando preenchimento',
  in_progress: 'Em preenchimento',
  responded: 'Respondido',
  incorporated: 'Incorporado',
  expired: 'Expirado',
  revoked: 'Revogado',
};

const consumeRate = async (supabaseAdmin: SupabaseClient, key: string, limit: number, windowSeconds: number) => {
  const { data, error } = await supabaseAdmin.rpc('consume_patient_anamnesis_link_rate_limit', {
    p_bucket_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error('[AnamnesisLinkForms] rate_limit_unavailable');
    return { allowed: false, unavailable: true };
  }
  return { allowed: data === true, unavailable: false };
};

const sendRateLimited = (res: Response) => {
  res.setHeader('Retry-After', '60');
  return res.status(429).json({ error: 'Muitas tentativas. Aguarde um momento e tente novamente.' });
};

const requestIdFromSession = (req: Request) => readPublicSession(String(req.headers.authorization || '').replace(/^Bearer\s+/i, ''));

export function registerAnamnesisLinkFormRoutes(
  app: Express,
  options: { supabaseAdmin: SupabaseClient; requireAuth: AuthMiddleware; publicOrigin: string; supabaseUrl: string }
) {
  const { supabaseAdmin, requireAuth, publicOrigin, supabaseUrl } = options;
  app.use('/api/anamnesis-link-forms', express.json({ limit: '512kb' }));
  app.use('/api/public/anamnesis-link', expressJsonForPublic(), applyPublicHeaders);

  const getRequest = async (requestId: string, professionalId?: string) => {
    let query = supabaseAdmin.from('patient_anamnesis_requests').select('*').eq('id', requestId);
    if (professionalId) query = query.eq('professional_id', professionalId);
    const { data: request, error } = await query.maybeSingle();
    if (error || !request) return null;
    const [{ data: response }, { data: incorporations }] = await Promise.all([
      supabaseAdmin.from('patient_anamnesis_request_responses').select('*').eq('request_id', requestId).maybeSingle(),
      supabaseAdmin.from('patient_anamnesis_request_incorporations').select('id').eq('request_id', requestId),
    ]);
    return { request, response, incorporations: incorporations || [] };
  };

  const publicSessionRequest = async (req: UserRequest) => {
    const session = requestIdFromSession(req);
    if (!session) return null;
    const found = await getRequest(session.requestId);
    if (!found) return null;
    if (found.request.revoked_at || isRequestExpired(found.request)) return null;
    return { ...found, session };
  };

  const loadPublicContext = async (professionalId: string, patientId: string) => {
    const [{ data: patient }, { data: professional }] = await Promise.all([
      supabaseAdmin.from('patients').select('full_name').eq('id', patientId).maybeSingle(),
      supabaseAdmin.from('professionals').select('full_name, professional_title, role, subscription_plan, subscription_status, subscription_ends_at, custom_logo_url').eq('id', professionalId).maybeSingle(),
    ]);
    return {
      identity: {
        patientInitials: initials(patient?.full_name),
        professionalFirstName: firstName(professional?.full_name),
        professionalTitle: trimString(professional?.professional_title) || null,
      },
      branding: getPublicBranding(professional, supabaseUrl),
    };
  };

  app.get('/api/anamnesis-link-forms/requests', requireAuth, async (req: UserRequest, res) => {
    if (!isFeatureEnabled()) return res.json({ enabled: false, requests: [] });
    const patientId = typeof req.query.patient_id === 'string' ? req.query.patient_id : null;
    if (!patientId || !req.user?.id) return res.status(400).json({ error: 'Paciente inválido.' });
    const { data: patient } = await supabaseAdmin.from('patients').select('id').eq('id', patientId).eq('professional_id', req.user.id).maybeSingle();
    if (!patient) return res.status(404).json({ error: 'Paciente não encontrado.' });
    const { data, error } = await supabaseAdmin.from('patient_anamnesis_requests').select('id, patient_id, template_id, template_version_id, target_anamnesis_id, respondent_type, snapshot, expires_at, created_at, first_opened_at, last_activity_at, revoked_at, submitted_at').eq('patient_id', patientId).eq('professional_id', req.user.id).order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: 'Não foi possível carregar as solicitações.' });
    const requests = await Promise.all((data || []).map(async (request: any) => {
      const found = await getRequest(request.id, req.user!.id);
      return { ...request, status: statusFor(request, found?.response, Boolean(found?.incorporations?.length)), statusLabel: statusLabel[statusFor(request, found?.response, Boolean(found?.incorporations?.length))] };
    }));
    return res.json({ enabled: true, requests });
  });

  app.post('/api/anamnesis-link-forms/requests', requireAuth, async (req: UserRequest, res) => {
    if (!isFeatureEnabled()) return res.status(404).json({ error: 'Funcionalidade indisponível.' });
    const professionalId = req.user?.id;
    const body = req.body || {};
    const patientId = typeof body.patientId === 'string' ? body.patientId : '';
    const templateId = typeof body.templateId === 'string' ? body.templateId : '';
    const respondentType = body.respondentType === 'responsible' ? 'responsible' : body.respondentType === 'patient' ? 'patient' : null;
    const expiryHours = Number(body.expiryHours ?? DEFAULT_EXPIRY_HOURS);
    if (!professionalId || !patientId || !templateId || !respondentType || !Number.isFinite(expiryHours) || expiryHours < MIN_EXPIRY_HOURS || expiryHours > MAX_EXPIRY_HOURS) return res.status(400).json({ error: 'Revise os dados da solicitação.' });
    const rate = await consumeRate(supabaseAdmin, `create:${professionalId}`, 20, 60 * 60);
    if (rate.unavailable) return res.status(503).json({ error: 'Criação temporariamente indisponível.' });
    if (!rate.allowed) return sendRateLimited(res);
    const [{ data: patient }, { data: template }] = await Promise.all([
      supabaseAdmin.from('patients').select('id').eq('id', patientId).eq('professional_id', professionalId).maybeSingle(),
      supabaseAdmin.from('anamnesis_templates').select('id, name, owner_professional_id, is_active, status').eq('id', templateId).maybeSingle(),
    ]);
    if (!patient || !template || template.is_active !== true || template.status !== 'active' || (template.owner_professional_id && template.owner_professional_id !== professionalId)) return res.status(404).json({ error: 'Modelo ou paciente não encontrado.' });
    const versionId = typeof body.templateVersionId === 'string' ? body.templateVersionId : null;
    let versionQuery = supabaseAdmin.from('anamnesis_template_versions').select('id, version_number, definition, status').eq('template_id', templateId).eq('status', 'published');
    versionQuery = versionId ? versionQuery.eq('id', versionId) : versionQuery.order('version_number', { ascending: false }).limit(1);
    const { data: versions, error: versionError } = await versionQuery;
    const version = versions?.[0];
    if (versionError || !version || !isObject(version.definition)) return res.status(400).json({ error: 'Versão do modelo indisponível.' });
    let snapshot: any;
    try {
      snapshot = buildSnapshot(version.definition as AnamnesisTemplateSchema, { fieldIds: body.fieldIds, sectionIds: body.sectionIds, templateVersionId: version.id, templateName: template.name, versionNumber: version.version_number });
    } catch {
      return res.status(400).json({ error: 'Seleção de campos inválida.' });
    }
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();
    const targetAnamnesisId = typeof body.targetAnamnesisId === 'string' ? body.targetAnamnesisId : null;
    if (targetAnamnesisId) {
      const { data: target } = await supabaseAdmin.from('patient_anamneses').select('id').eq('id', targetAnamnesisId).eq('patient_id', patientId).eq('professional_id', professionalId).maybeSingle();
      if (!target) return res.status(400).json({ error: 'Anamnese de destino inválida.' });
    }
    const { data: request, error: requestError } = await supabaseAdmin.from('patient_anamnesis_requests').insert({ professional_id: professionalId, patient_id: patientId, template_id: templateId, template_version_id: version.id, target_anamnesis_id: targetAnamnesisId, respondent_type: respondentType, snapshot, public_token_hash: hashToken(token), expires_at: expiresAt }).select('id, patient_id, template_id, template_version_id, target_anamnesis_id, respondent_type, snapshot, expires_at, created_at').single();
    if (requestError || !request) return res.status(500).json({ error: 'Não foi possível gerar a solicitação.' });
    const { error: responseError } = await supabaseAdmin.from('patient_anamnesis_request_responses').insert({ request_id: request.id });
    if (responseError) {
      await supabaseAdmin.from('patient_anamnesis_requests').delete().eq('id', request.id);
      return res.status(500).json({ error: 'Não foi possível preparar o formulário.' });
    }
    return res.status(201).json({ request, link: new URL(`/preencher/anamnese/${token}`, publicOrigin).toString() });
  });

  app.get('/api/anamnesis-link-forms/requests/:id', requireAuth, async (req: UserRequest, res) => {
    if (!isFeatureEnabled()) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    const found = await getRequest(req.params.id, req.user?.id);
    if (!found) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    const status = statusFor(found.request, found.response, found.incorporations.length > 0);
    return res.json({ request: found.request, response: found.response, incorporations: found.incorporations, status, statusLabel: statusLabel[status] });
  });

  app.post('/api/anamnesis-link-forms/requests/:id/revoke', requireAuth, async (req: UserRequest, res) => {
    if (!isFeatureEnabled()) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    const found = await getRequest(req.params.id, req.user?.id);
    if (!found) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    if (found.request.revoked_at) return res.json({ ok: true });
    const { error } = await supabaseAdmin.from('patient_anamnesis_requests').update({ revoked_at: new Date().toISOString(), last_activity_at: new Date().toISOString() }).eq('id', req.params.id).eq('professional_id', req.user!.id).is('revoked_at', null);
    if (error) return res.status(500).json({ error: 'Não foi possível revogar o link.' });
    return res.json({ ok: true });
  });

  app.post('/api/anamnesis-link-forms/requests/:id/incorporate', requireAuth, async (req: UserRequest, res) => {
    if (!isFeatureEnabled()) return res.status(404).json({ error: 'Solicitação não encontrada.' });
    const fieldIds = Array.isArray(req.body?.fieldIds) ? req.body.fieldIds.filter((value: unknown): value is string => typeof value === 'string') : [];
    const action = ['field', 'section', 'all'].includes(req.body?.action) ? req.body.action : 'field';
    if (fieldIds.length === 0 || fieldIds.length > MAX_FIELDS) return res.status(400).json({ error: 'Selecione ao menos um campo.' });
    const { data, error } = await supabaseAdmin.rpc('incorporate_patient_anamnesis_link_answers', { p_request_id: req.params.id, p_actor_id: req.user?.id, p_field_ids: fieldIds, p_action: action });
    if (error) {
      const code = String(error.message || '');
      if (/not_found|forbidden/.test(code)) return res.status(404).json({ error: 'Solicitação não encontrada.' });
      if (/must_be_draft/.test(code)) return res.status(409).json({ error: 'Reabra a Anamnese antes de incorporar respostas.' });
      return res.status(400).json({ error: 'Não foi possível incorporar as respostas.' });
    }
    return res.json({ ok: true, result: data });
  });

  app.post('/api/public/anamnesis-link/bootstrap', async (req: Request, res: Response) => {
    if (!isFeatureEnabled()) return unavailable(res);
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (token.length < 40 || token.length > 160) return unavailable(res);
    const rate = await consumeRate(supabaseAdmin, `bootstrap:${getIpKey(req)}`, 10, 10 * 60);
    if (rate.unavailable) return res.status(503).json({ error: PUBLIC_ERROR });
    if (!rate.allowed) return sendRateLimited(res);
    const found = await getRequestByHash(supabaseAdmin, hashToken(token));
    if (!found) return unavailable(res);
    if (found.request.revoked_at || isRequestExpired(found.request)) return unavailable(res, 410);
    const publicContext = await loadPublicContext(found.request.professional_id, found.request.patient_id);
    if (found.request.submitted_at || found.response?.submitted_at) return res.status(409).json({ error: 'Este formulário já foi enviado.', code: 'submitted', branding: publicContext.branding });
    const now = new Date().toISOString();
    await supabaseAdmin.from('patient_anamnesis_requests').update({ first_opened_at: found.request.first_opened_at || now, last_activity_at: now }).eq('id', found.request.id);
    return res.json({ session: createPublicSession(found.request.id, found.request.expires_at), expiresAt: found.request.expires_at, respondentType: found.request.respondent_type, identity: publicContext.identity, branding: publicContext.branding, snapshot: found.request.snapshot, draft: found.response?.draft_answers || {}, revision: found.response?.revision || 0, respondentName: found.response?.respondent_name || '', respondentRelationship: found.response?.respondent_relationship || '' });
  });

  app.get('/api/public/anamnesis-link/form', async (req: UserRequest, res: Response) => {
    if (!isFeatureEnabled()) return unavailable(res);
    const found = await publicSessionRequest(req);
    if (!found) return unavailable(res);
    const publicContext = await loadPublicContext(found.request.professional_id, found.request.patient_id);
    return res.json({ session: createPublicSession(found.request.id, found.request.expires_at), identity: publicContext.identity, branding: publicContext.branding, snapshot: found.request.snapshot, respondentType: found.request.respondent_type, draft: found.response?.draft_answers || {}, revision: found.response?.revision || 0, respondentName: found.response?.respondent_name || '', respondentRelationship: found.response?.respondent_relationship || '', status: statusFor(found.request, found.response, found.incorporations.length > 0) });
  });

  app.patch('/api/public/anamnesis-link/draft', async (req: UserRequest, res: Response) => {
    if (!isFeatureEnabled()) return unavailable(res);
    const found = await publicSessionRequest(req);
    if (!found) return unavailable(res);
    const rate = await consumeRate(supabaseAdmin, `draft:${found.request.id}`, 30, 10 * 60);
    if (rate.unavailable) return res.status(503).json({ error: 'Salvamento temporariamente indisponível.' });
    if (!rate.allowed) return sendRateLimited(res);
    if (found.response?.last_saved_at && Date.now() - new Date(found.response.last_saved_at).getTime() < 1_800) {
      res.setHeader('Retry-After', '2');
      return res.status(429).json({ error: 'Aguarde o salvamento anterior terminar.' });
    }
    if (Number(req.body?.baseRevision) !== found.response?.revision) return res.status(409).json({ error: 'Este formulário mudou em outra aba. Recarregue a versão mais recente.', code: 'revision_conflict', revision: found.response?.revision || 0 });
    const validation = validateAnswers(found.request.snapshot, req.body?.answers, false);
    if (!validation.valid) return res.status(400).json({ error: 'Revise os campos informados.', fieldErrors: validation.errors });
    const respondentName = trimString(req.body?.respondentName);
    const respondentRelationship = trimString(req.body?.respondentRelationship);
    if (respondentName.length > 120 || respondentRelationship.length > 120) return res.status(400).json({ error: 'Identificação muito longa.' });
    const nextRevision = (found.response?.revision || 0) + 1;
    const { data, error } = await supabaseAdmin.from('patient_anamnesis_request_responses').update({ draft_answers: req.body.answers, respondent_name: respondentName || null, respondent_relationship: respondentRelationship || null, revision: nextRevision, last_saved_at: new Date().toISOString() }).eq('request_id', found.request.id).eq('revision', found.response?.revision || 0).is('submitted_at', null).select('revision, last_saved_at').maybeSingle();
    if (error || !data) return res.status(409).json({ error: 'Este formulário mudou em outra aba. Recarregue a versão mais recente.', code: 'revision_conflict' });
    await supabaseAdmin.from('patient_anamnesis_requests').update({ last_activity_at: new Date().toISOString() }).eq('id', found.request.id);
    return res.json({ ok: true, session: createPublicSession(found.request.id, found.request.expires_at), revision: data.revision, savedAt: data.last_saved_at });
  });

  app.post('/api/public/anamnesis-link/submit', async (req: UserRequest, res: Response) => {
    if (!isFeatureEnabled()) return unavailable(res);
    const found = await publicSessionRequest(req);
    if (!found) return unavailable(res);
    const rate = await consumeRate(supabaseAdmin, `submit:${found.request.id}`, 5, 10 * 60);
    if (rate.unavailable) return res.status(503).json({ error: 'Envio temporariamente indisponível.' });
    if (!rate.allowed) return sendRateLimited(res);
    if (found.response?.submitted_at) return res.json({ ok: true, submittedAt: found.response.submitted_at, status: 'submitted' });
    const validation = validateAnswers(found.request.snapshot, req.body?.answers, true);
    if (!validation.valid) return res.status(400).json({ error: 'Preencha os campos obrigatórios antes de enviar.', fieldErrors: validation.errors });
    const respondentName = trimString(req.body?.respondentName);
    const respondentRelationship = trimString(req.body?.respondentRelationship);
    if (found.request.respondent_type === 'responsible' && (!respondentName || !respondentRelationship)) return res.status(400).json({ error: 'Informe seu nome e vínculo com o paciente.', fieldErrors: [{ fieldId: '_respondent', message: 'Nome e vínculo são obrigatórios.' }] });
    if (respondentName.length > 120 || respondentRelationship.length > 120) return res.status(400).json({ error: 'Identificação muito longa.' });
    const idempotencyKey = typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey.trim() : '';
    if (idempotencyKey.length < 16 || idempotencyKey.length > 120) return res.status(400).json({ error: 'Não foi possível confirmar o envio.' });
    const { data, error } = await supabaseAdmin.rpc('submit_patient_anamnesis_link_response', { p_request_id: found.request.id, p_answers: req.body.answers, p_base_revision: Number(req.body?.baseRevision), p_respondent_name: respondentName, p_respondent_relationship: respondentRelationship, p_idempotency_key: idempotencyKey });
    if (error) {
      if (/revision_conflict/.test(String(error.message))) return res.status(409).json({ error: 'Este formulário mudou em outra aba. Recarregue a versão mais recente.', code: 'revision_conflict' });
      if (/unavailable/.test(String(error.message))) return unavailable(res, 410);
      return res.status(400).json({ error: 'Não foi possível enviar o formulário.' });
    }
    return res.json({ ok: true, status: 'submitted', submittedAt: data?.submittedAt || new Date().toISOString() });
  });

  app.get('/api/public/anamnesis-link/status', async (req: UserRequest, res: Response) => {
    if (!isFeatureEnabled()) return unavailable(res);
    const session = requestIdFromSession(req);
    if (!session) return unavailable(res);
    const found = await publicSessionRequest(req);
    if (!found) return unavailable(res);
    return res.json({ session: createPublicSession(found.request.id, found.request.expires_at), status: statusFor(found.request, found.response, found.incorporations.length > 0), submittedAt: found.response?.submitted_at || found.request.submitted_at || null });
  });
}

async function getRequestByHash(supabaseAdmin: SupabaseClient, tokenHash: string) {
  const { data: request, error } = await supabaseAdmin.from('patient_anamnesis_requests').select('*').eq('public_token_hash', tokenHash).maybeSingle();
  if (error || !request) return null;
  const { data: response } = await supabaseAdmin.from('patient_anamnesis_request_responses').select('*').eq('request_id', request.id).maybeSingle();
  const { data: incorporations } = await supabaseAdmin.from('patient_anamnesis_request_incorporations').select('id').eq('request_id', request.id);
  return { request, response, incorporations: incorporations || [] };
}

function expressJsonForPublic() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.body && Object.keys(req.body).length > 0) return next();
    return express.json({ limit: '512kb' })(req, res, next);
  };
}
