import { supabase } from '../supabaseClient';

export type SupportAiMode = 'auto_reply' | 'triage' | 'draft';

export interface SupportAiSettings {
  id: 'default';
  enabled: boolean;
  mode: SupportAiMode;
  introMessage: string;
  systemPrompt: string;
  modelOverride: string | null;
  updatedBy: string | null;
  updatedAt: string;
}

export interface SupportAiDraft {
  id: string;
  ticketId: string;
  sourceEventKey: string;
  content: string;
  model: string | null;
  status: 'pending' | 'used' | 'dismissed';
  createdAt: string;
  updatedAt: string;
}

function mapSettings(row: any): SupportAiSettings {
  return {
    id: 'default',
    enabled: row.enabled !== false,
    mode: row.mode as SupportAiMode,
    introMessage: row.intro_message || '',
    systemPrompt: row.system_prompt || '',
    modelOverride: row.model_override || null,
    updatedBy: row.updated_by || null,
    updatedAt: row.updated_at,
  };
}

function mapDraft(row: any): SupportAiDraft {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    sourceEventKey: row.source_event_key,
    content: row.content,
    model: row.model || null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function authenticatedPost(body: Record<string, unknown>) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sessão expirada. Entre novamente para continuar.');

  const response = await fetch('/api/support-ai', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || 'Não foi possível processar a IA do suporte.');
  }
  return payload;
}

export async function processSupportAiEvent(
  ticketId: string,
  eventType: 'create' | 'message',
  sourceMessageId?: string | null,
) {
  return authenticatedPost({
    action: 'process',
    ticketId,
    eventType,
    sourceMessageId: sourceMessageId || null,
  });
}

export async function regenerateSupportAiDraft(ticketId: string): Promise<{ content: string; model: string }> {
  return authenticatedPost({ action: 'regenerate', ticketId });
}

export async function fetchSupportAiSettings(): Promise<SupportAiSettings> {
  const { data, error } = await supabase
    .from('support_ai_settings')
    .select('*')
    .eq('id', 'default')
    .single();
  if (error) throw error;
  return mapSettings(data);
}

export async function updateSupportAiSettings(input: {
  enabled?: boolean;
  mode?: SupportAiMode;
  introMessage?: string;
  systemPrompt?: string;
  modelOverride?: string | null;
}): Promise<SupportAiSettings> {
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (!userId) throw new Error('Usuário não autenticado.');

  const changes: Record<string, unknown> = { updated_by: userId };
  if (typeof input.enabled === 'boolean') changes.enabled = input.enabled;
  if (input.mode) changes.mode = input.mode;
  if (typeof input.introMessage === 'string') changes.intro_message = input.introMessage.trim();
  if (typeof input.systemPrompt === 'string') changes.system_prompt = input.systemPrompt.trim();
  if (input.modelOverride !== undefined) changes.model_override = input.modelOverride?.trim() || null;

  const { data, error } = await supabase
    .from('support_ai_settings')
    .update(changes)
    .eq('id', 'default')
    .select('*')
    .single();
  if (error) throw error;
  return mapSettings(data);
}

export async function fetchSupportAiDraft(ticketId: string): Promise<SupportAiDraft | null> {
  const { data, error } = await supabase
    .from('support_ai_drafts')
    .select('*')
    .eq('ticket_id', ticketId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapDraft(data) : null;
}

export async function setSupportAiDraftStatus(
  draftId: string,
  status: 'used' | 'dismissed',
): Promise<void> {
  const { error } = await supabase
    .from('support_ai_drafts')
    .update({ status })
    .eq('id', draftId);
  if (error) throw error;
}
