import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import { randomUUID } from 'crypto';
import { loadServerEnvironment } from '../server/config/environment.js';

type SupportAiMode = 'auto_reply' | 'triage' | 'draft';
type SupportAiEventType = 'create' | 'message';

const DEFAULT_MODEL = 'gemini-3.5-flash';
const DEPRECATED_MODEL_FALLBACKS: Record<string, string> = {
  'gemini-1.5-flash': 'gemini-3.5-flash',
  'gemini-1.5-flash-001': 'gemini-3.5-flash',
  'gemini-2.0-flash-lite': 'gemini-3.1-flash-lite',
  'gemini-2.0-flash-lite-001': 'gemini-3.1-flash-lite'
};

const readBearerToken = (req: VercelRequest) => {
  const authorization = String(req.headers.authorization || '').trim();
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
};

const getGeminiSettings = async (supabaseAdmin: SupabaseClient) => {
  let apiKey = '';
  let modelName = DEFAULT_MODEL;

  const { data } = await supabaseAdmin
    .from('settings')
    .select('api_key')
    .eq('id', 'gemini')
    .maybeSingle();

  if (data?.api_key) {
    const raw = String(data.api_key);
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        apiKey = String(parsed.key || parsed.api_key || '').trim();
        modelName = String(parsed.model || DEFAULT_MODEL).trim();
      } else {
        apiKey = raw.trim();
      }
    } catch {
      apiKey = raw.trim();
    }
  }

  if (DEPRECATED_MODEL_FALLBACKS[modelName]) {
    modelName = DEPRECATED_MODEL_FALLBACKS[modelName];
  }

  if (!apiKey) {
    apiKey = String(process.env.GEMINI_API_KEY_REAL || process.env.GEMINI_API_KEY || '').trim();
  }

  return { apiKey, modelName };
};

const getSupportSettings = async (supabaseAdmin: SupabaseClient) => {
  const { data, error } = await supabaseAdmin
    .from('support_ai_settings')
    .select('*')
    .eq('id', 'default')
    .maybeSingle();

  if (error) throw error;
  return data;
};

const resolveSystemSender = async (supabaseAdmin: SupabaseClient, preferredId?: string | null) => {
  if (preferredId) {
    const { data } = await supabaseAdmin
      .from('professionals')
      .select('id, role')
      .eq('id', preferredId)
      .maybeSingle();
    if (data?.role === 'admin') return data.id as string;
  }

  const { data, error } = await supabaseAdmin
    .from('professionals')
    .select('id')
    .eq('role', 'admin')
    .limit(1);

  if (error) throw error;
  const adminId = data?.[0]?.id;
  if (!adminId) throw new Error('Nenhum administrador disponível para registrar a resposta do suporte.');
  return String(adminId);
};

const buildConversationContext = async (supabaseAdmin: SupabaseClient, ticket: any) => {
  const { data: messages, error } = await supabaseAdmin
    .from('support_messages')
    .select('id, sender_id, message, origin, sender_label, created_at')
    .eq('ticket_id', ticket.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(40);

  if (error) throw error;

  const senderIds = Array.from(new Set((messages || []).map((message: any) => message.sender_id).filter(Boolean)));
  let roleById = new Map<string, string>();
  if (senderIds.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from('professionals')
      .select('id, role')
      .in('id', senderIds);
    roleById = new Map((profiles || []).map((profile: any) => [String(profile.id), String(profile.role)]));
  }

  const history = [...(messages || [])].reverse().map((message: any) => {
    const isAi = message.origin === 'support_ai';
    const isAdmin = roleById.get(String(message.sender_id)) === 'admin';
    const speaker = isAi ? 'Assistente de suporte' : isAdmin ? 'Atendente' : 'Profissional';
    return `${speaker}: ${String(message.message || '').trim()}`;
  }).filter(Boolean).join('\n\n');

  return [
    `Assunto do chamado: ${ticket.subject}`,
    `Categoria: ${ticket.category}`,
    `Descrição inicial do profissional: ${ticket.description}`,
    history ? `Histórico da conversa:\n${history}` : 'Histórico da conversa: ainda não há mensagens adicionais.'
  ].join('\n\n');
};

const generateAnswer = async (supabaseAdmin: SupabaseClient, settings: any, ticket: any) => {
  const configured = await getGeminiSettings(supabaseAdmin);
  const apiKey = configured.apiKey;
  const model = String(settings?.model_override || configured.modelName || DEFAULT_MODEL).trim();

  if (!apiKey) throw new Error('Configuração do Gemini ausente no servidor.');

  const context = await buildConversationContext(supabaseAdmin, ticket);
  const systemPrompt = String(settings?.system_prompt || '').trim();
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: [{
      role: 'user',
      parts: [{
        text: `${systemPrompt}\n\nCONTEXTO DO CHAMADO\n${context}\n\nElabore agora a resposta de suporte mais adequada para a última solicitação do profissional.`
      }]
    }]
  });

  const content = String(response.text || '').trim();
  if (!content) throw new Error('O Gemini não retornou uma resposta utilizável.');
  return { content: content.slice(0, 12000), model };
};

const getFirstResponseWindow = (ticket: any) => {
  if (ticket?.priority === 'high') return '2 horas úteis';
  if (ticket?.priority === 'medium') {
    return ticket?.category === 'payment' ? '12 horas úteis' : '24 horas úteis';
  }
  return '48 horas úteis';
};

const buildTriageFallback = (responseWindow: string) =>
  `Olá! Recebemos sua solicitação e ela já está com nossa equipe. Vamos analisar o que você enviou e responder por aqui em até ${responseWindow}. Se quiser acrescentar alguma informação enquanto isso, pode enviar nesta conversa.`;

const generateTriageAnswer = async (supabaseAdmin: SupabaseClient, settings: any, ticket: any) => {
  const responseWindow = getFirstResponseWindow(ticket);
  const fallback = buildTriageFallback(responseWindow);

  try {
    const configured = await getGeminiSettings(supabaseAdmin);
    const apiKey = configured.apiKey;
    const model = String(settings?.model_override || configured.modelName || DEFAULT_MODEL).trim();
    if (!apiKey) return { content: fallback, model: null };

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model,
      contents: [{
        role: 'user',
        parts: [{
          text: [
            'Escreva uma mensagem curta de confirmação de recebimento para um profissional que acabou de abrir uma solicitação de suporte no Evolução Clínica.',
            'A mensagem deve ser humana, acolhedora, simples e profissional.',
            'Não tente resolver a dúvida agora. Apenas confirme o recebimento e informe que a equipe responderá em breve.',
            `O prazo correto e obrigatório para a primeira resposta é: até ${responseWindow}.`,
            'Use exatamente esse prazo; não invente outro prazo e não prometa resposta antes dele.',
            'Não use os termos IA, inteligência artificial, bot, automação, SLA, escalonamento, escalado, protocolo ou termos técnicos internos.',
            'Não mencione regras internas, prioridade de fila ou funcionamento do sistema.',
            'Não repita, resuma ou interprete o conteúdo da solicitação nesta mensagem.',
            'Use no máximo 3 frases e termine de forma natural.',
          ].join('\n')
        }]
      }]
    });

    const content = String(response.text || '').trim();
    const hasRequiredWindow = content.toLowerCase().includes(responseWindow.toLowerCase());
    const hasForbiddenTerm = /\b(sla|bot|automação|escalonamento|escalado|escalada|protocolo)\b|inteligência artificial|\bia\b/i.test(content);

    if (!content || !hasRequiredWindow || hasForbiddenTerm) {
      return { content: fallback, model };
    }

    return { content: content.slice(0, 1500), model };
  } catch (error) {
    console.warn('[SupportAI] Falha ao gerar primeiro atendimento; usando mensagem segura de apoio:', error);
    return { content: fallback, model: null };
  }
};

const processTriage = async (input: {
  supabaseAdmin: SupabaseClient;
  settings: any;
  ticket: any;
  requesterId: string;
}) => {
  const { supabaseAdmin, settings, ticket, requesterId } = input;
  const eventKey = `ticket:${ticket.id}:create`;

  const { data: previousRun } = await supabaseAdmin
    .from('support_ai_runs')
    .select('id, status, result_type')
    .eq('event_key', eventKey)
    .eq('mode', 'triage')
    .maybeSingle();

  if (previousRun) {
    return { processed: false, reason: 'already_processed', run: previousRun };
  }

  const runId = randomUUID();
  const { error: runError } = await supabaseAdmin.from('support_ai_runs').insert({
    id: runId,
    ticket_id: ticket.id,
    source_message_id: null,
    event_key: eventKey,
    mode: 'triage',
    status: 'processing',
    result_type: 'intro',
    requested_by: requesterId
  });
  if (runError) {
    if (runError.code === '23505') return { processed: false, reason: 'already_processing' };
    throw runError;
  }

  try {
    const generated = await generateTriageAnswer(supabaseAdmin, settings, ticket);
    const senderId = await resolveSystemSender(supabaseAdmin, settings.updated_by);
    const { error: messageError } = await supabaseAdmin.from('support_messages').insert({
      ticket_id: ticket.id,
      sender_id: senderId,
      message: generated.content,
      origin: 'support_ai',
      sender_label: 'Equipe Evolução Clínica',
      ai_run_id: runId
    });
    if (messageError) throw messageError;

    await updateRun(supabaseAdmin, runId, {
      status: 'completed',
      result_type: 'intro',
      response_content: generated.content,
      model: generated.model
    });

    return {
      processed: true,
      mode: 'triage' as const,
      resultType: 'intro' as const,
      responseWindow: getFirstResponseWindow(ticket)
    };
  } catch (error: any) {
    await updateRun(supabaseAdmin, runId, {
      status: 'error',
      error_message: String(error?.message || error || 'Erro desconhecido').slice(0, 2000)
    });
    throw error;
  }
};

const updateRun = async (supabaseAdmin: SupabaseClient, runId: string, values: Record<string, unknown>) => {
  await supabaseAdmin
    .from('support_ai_runs')
    .update({ ...values, completed_at: new Date().toISOString() })
    .eq('id', runId);
};

const persistSupportSuggestion = async (input: {
  supabaseAdmin: SupabaseClient;
  settings: any;
  ticket: any;
  ticketId: string;
  sourceMessageId?: string | null;
  eventKey: string;
  requestedBy: string;
  autoReply: boolean;
}) => {
  const {
    supabaseAdmin,
    settings,
    ticket,
    ticketId,
    sourceMessageId,
    eventKey,
    requestedBy,
    autoReply,
  } = input;
  const mode: SupportAiMode = autoReply ? 'auto_reply' : 'draft';

  const { data: previousRun } = await supabaseAdmin
    .from('support_ai_runs')
    .select('id, status, result_type')
    .eq('event_key', eventKey)
    .eq('mode', mode)
    .maybeSingle();

  if (previousRun) {
    return { processed: false, reason: 'already_processed', run: previousRun };
  }

  const runId = randomUUID();
  const { error: runError } = await supabaseAdmin.from('support_ai_runs').insert({
    id: runId,
    ticket_id: ticketId,
    source_message_id: sourceMessageId || null,
    event_key: eventKey,
    mode,
    status: 'processing',
    requested_by: requestedBy
  });
  if (runError) {
    if (runError.code === '23505') return { processed: false, reason: 'already_processing' };
    throw runError;
  }

  try {
    const generated = await generateAnswer(supabaseAdmin, settings, ticket);

    const { error: draftError } = await supabaseAdmin.from('support_ai_drafts').upsert({
      ticket_id: ticketId,
      source_event_key: eventKey,
      content: generated.content,
      model: generated.model,
      status: 'pending',
      updated_at: new Date().toISOString()
    }, { onConflict: 'ticket_id' });
    if (draftError) throw draftError;

    if (autoReply) {
      const senderId = await resolveSystemSender(supabaseAdmin, settings.updated_by);
      const { error: replyError } = await supabaseAdmin.from('support_messages').insert({
        ticket_id: ticketId,
        sender_id: senderId,
        message: generated.content,
        origin: 'support_ai',
        sender_label: 'Equipe Evolução Clínica',
        ai_run_id: runId
      });
      if (replyError) throw replyError;

      await updateRun(supabaseAdmin, runId, {
        status: 'completed',
        result_type: 'auto_reply',
        response_content: generated.content,
        model: generated.model
      });
      return { processed: true, mode, resultType: 'auto_reply', draftAvailable: true };
    }

    await updateRun(supabaseAdmin, runId, {
      status: 'completed',
      result_type: 'draft',
      response_content: generated.content,
      model: generated.model
    });
    return { processed: true, mode, resultType: 'draft', draftAvailable: true };
  } catch (error: any) {
    await updateRun(supabaseAdmin, runId, {
      status: 'error',
      error_message: String(error?.message || error || 'Erro desconhecido').slice(0, 2000)
    });
    throw error;
  }
};

const processEvent = async (input: {
  supabaseAdmin: SupabaseClient;
  ticketId: string;
  eventType: SupportAiEventType;
  sourceMessageId?: string | null;
  requesterId: string;
  requesterRole: string;
}) => {
  const { supabaseAdmin, ticketId, eventType, sourceMessageId, requesterId, requesterRole } = input;
  const settings = await getSupportSettings(supabaseAdmin);
  if (!settings) return { processed: false, reason: 'not_configured' };

  const { data: ticket, error: ticketError } = await supabaseAdmin
    .from('support_tickets')
    .select('*')
    .eq('id', ticketId)
    .maybeSingle();
  if (ticketError) throw ticketError;
  if (!ticket) throw new Error('Chamado não encontrado.');

  if (requesterRole === 'admin' || ticket.user_id !== requesterId) {
    return { processed: false, reason: 'not_professional_event' };
  }

  if (eventType === 'create') {
    let triageResult: any = null;
    if (settings.triage_enabled === true) {
      triageResult = await processTriage({ supabaseAdmin, settings, ticket, requesterId });
    }

    let suggestionResult: any = null;
    try {
      suggestionResult = await persistSupportSuggestion({
        supabaseAdmin,
        settings,
        ticket,
        ticketId,
        sourceMessageId: null,
        eventKey: `ticket:${ticketId}:initial-suggestion`,
        requestedBy: requesterId,
        autoReply: false,
      });
    } catch (suggestionError) {
      console.error('[SupportAI] Falha ao preparar sugestão inicial:', suggestionError);
    }

    return {
      processed: Boolean(triageResult?.processed || suggestionResult?.processed),
      firstContact: triageResult,
      suggestion: suggestionResult,
    };
  }

  if (!sourceMessageId) throw new Error('Mensagem de origem ausente.');
  const { data: sourceMessage, error } = await supabaseAdmin
    .from('support_messages')
    .select('id, ticket_id, sender_id, origin')
    .eq('id', sourceMessageId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!sourceMessage || sourceMessage.ticket_id !== ticketId || sourceMessage.sender_id !== requesterId || sourceMessage.origin === 'support_ai') {
    return { processed: false, reason: 'invalid_source_message' };
  }

  const autoReplyEnabled = settings.enabled === true && settings.mode === 'auto_reply';
  return persistSupportSuggestion({
    supabaseAdmin,
    settings,
    ticket,
    ticketId,
    sourceMessageId,
    eventKey: `message:${sourceMessageId}`,
    requestedBy: requesterId,
    autoReply: autoReplyEnabled,
  });
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Vary', 'Authorization');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  let environment;
  try {
    environment = loadServerEnvironment(process.env);
    environment.assertEnabled('gemini');
  } catch (error: any) {
    return res.status(503).json({ ok: false, error: error?.message || 'gemini_disabled' });
  }

  const accessToken = readBearerToken(req);
  if (!accessToken) return res.status(401).json({ ok: false, error: 'authentication_required' });

  const supabaseAdmin = createClient(environment.supabase.url, environment.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
  const user = authData?.user;
  if (authError || !user) return res.status(401).json({ ok: false, error: 'invalid_session' });

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('professionals')
    .select('id, role')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError || !profile) return res.status(403).json({ ok: false, error: 'profile_not_found' });

  try {
    const action = String(req.body?.action || 'process');
    const ticketId = String(req.body?.ticketId || '').trim();
    if (!ticketId) return res.status(400).json({ ok: false, error: 'ticket_id_required' });

    if (action === 'regenerate') {
      if (profile.role !== 'admin') return res.status(403).json({ ok: false, error: 'admin_only' });
      const settings = await getSupportSettings(supabaseAdmin);
      if (!settings) return res.status(409).json({ ok: false, error: 'support_ai_not_configured' });
      const { data: ticket, error } = await supabaseAdmin.from('support_tickets').select('*').eq('id', ticketId).maybeSingle();
      if (error) throw error;
      if (!ticket) return res.status(404).json({ ok: false, error: 'ticket_not_found' });
      const generated = await generateAnswer(supabaseAdmin, settings, ticket);
      const eventKey = `manual:${ticketId}:${randomUUID()}`;
      const { error: draftError } = await supabaseAdmin.from('support_ai_drafts').upsert({
        ticket_id: ticketId,
        source_event_key: eventKey,
        content: generated.content,
        model: generated.model,
        status: 'pending',
        updated_at: new Date().toISOString()
      }, { onConflict: 'ticket_id' });
      if (draftError) throw draftError;
      await supabaseAdmin.from('support_ai_runs').insert({
        ticket_id: ticketId,
        event_key: eventKey,
        mode: 'draft',
        status: 'completed',
        result_type: 'draft',
        response_content: generated.content,
        model: generated.model,
        requested_by: user.id,
        completed_at: new Date().toISOString()
      });
      return res.json({ ok: true, content: generated.content, model: generated.model });
    }

    const eventType = String(req.body?.eventType || '') as SupportAiEventType;
    if (eventType !== 'create' && eventType !== 'message') {
      return res.status(400).json({ ok: false, error: 'invalid_event_type' });
    }

    const result = await processEvent({
      supabaseAdmin,
      ticketId,
      eventType,
      sourceMessageId: req.body?.sourceMessageId ? String(req.body.sourceMessageId) : null,
      requesterId: user.id,
      requesterRole: String(profile.role || 'user')
    });
    return res.json({ ok: true, ...result });
  } catch (error: any) {
    console.error('[SupportAI] Falha ao processar atendimento:', error?.message || error);
    return res.status(500).json({ ok: false, error: error?.message || 'support_ai_failed' });
  }
}
