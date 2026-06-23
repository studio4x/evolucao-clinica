import { supabase } from '../supabaseClient';

export type SupportTicketCategory = 'payment' | 'technical' | 'account' | 'general';
export type SupportTicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type SupportTicketStatus = 'open' | 'in_progress' | 'closed';
export type SupportSlaStatus = 'on_time' | 'at_risk' | 'overdue' | 'answered';

export interface SupportTicket {
  id: string;
  userId: string;
  subject: string;
  description: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  category: SupportTicketCategory;
  attachmentUrl: string | null;
  attachmentName: string | null;
  firstResponseDueAt: string | null;
  firstResponseAt: string | null;
  slaPolicyKey: string;
  slaStatus: SupportSlaStatus;
  createdAt: string;
  updatedAt: string;
  userFullName?: string | null;
  userPlan?: string | null;
}

export interface SupportMessage {
  id: string;
  ticketId: string;
  senderId: string;
  message: string;
  attachmentUrl: string | null;
  attachmentName: string | null;
  createdAt: string;
  senderName?: string | null;
  senderRole?: 'admin' | 'user';
}

export interface SupportTicketDetail {
  ticket: SupportTicket;
  messages: SupportMessage[];
}

// Map database row to SupportTicket interface
function mapSupportTicket(row: any): SupportTicket {
  return {
    id: row.id,
    userId: row.user_id,
    subject: row.subject,
    description: row.description,
    status: row.status,
    priority: row.priority,
    category: row.category,
    attachmentUrl: row.attachment_url,
    attachmentName: row.attachment_name,
    firstResponseDueAt: row.first_response_due_at,
    firstResponseAt: row.first_response_at,
    slaPolicyKey: row.sla_policy_key,
    slaStatus: row.sla_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Map database row to SupportMessage interface
function mapSupportMessage(row: any, professionalsMap: Map<string, any>): SupportMessage {
  const sender = professionalsMap.get(row.sender_id);
  const senderRole = sender?.role === 'admin' ? 'admin' : 'user';

  return {
    id: row.id,
    ticketId: row.ticket_id,
    senderId: row.sender_id,
    message: row.message,
    attachmentUrl: row.attachment_url,
    attachmentName: row.attachment_name,
    createdAt: row.created_at,
    senderName: sender?.full_name || 'Profissional',
    senderRole,
  };
}

// Fetch tickets opened by the current professional
export async function fetchMySupportTickets(): Promise<SupportTicket[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuário não autenticado.');

  const { data, error } = await supabase
    .from('support_tickets')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(mapSupportTicket);
}

// Fetch all support tickets (Admin only)
export async function fetchAdminSupportTickets(): Promise<SupportTicket[]> {
  const { data: tickets, error: ticketsError } = await supabase
    .from('support_tickets')
    .select('*')
    .order('created_at', { ascending: false });

  if (ticketsError) throw ticketsError;

  const rows = tickets || [];
  const userIds = Array.from(new Set(rows.map((t) => t.user_id)));

  if (userIds.length === 0) return [];

  // Fetch profiles of the creators of the tickets
  const { data: professionals, error: professionalsError } = await supabase
    .from('professionals')
    .select('id, full_name, role, subscription_plan')
    .in('id', userIds);

  if (professionalsError) throw professionalsError;

  const profMap = new Map((professionals || []).map((p) => [p.id, p]));

  return rows.map((row) => {
    const ticket = mapSupportTicket(row);
    const prof = profMap.get(ticket.userId);
    return {
      ...ticket,
      userFullName: prof?.full_name || 'Desconhecido',
      userPlan: prof?.subscription_plan || 'trial',
    };
  });
}

// Fetch ticket details with message history
export async function fetchSupportTicketDetail(ticketId: string): Promise<SupportTicketDetail> {
  const { data: ticketData, error: ticketError } = await supabase
    .from('support_tickets')
    .select('*')
    .eq('id', ticketId)
    .single();

  if (ticketError || !ticketData) {
    throw ticketError || new Error('Chamado não encontrado.');
  }

  const ticket = mapSupportTicket(ticketData);

  const { data: messagesData, error: messagesError } = await supabase
    .from('support_messages')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true });

  if (messagesError) throw messagesError;

  const messages = messagesData || [];
  const senderIds = Array.from(new Set([ticket.userId, ...messages.map((m) => m.sender_id)]));

  const { data: professionals, error: professionalsError } = await supabase
    .from('professionals')
    .select('id, full_name, role, subscription_plan')
    .in('id', senderIds);

  if (professionalsError) throw professionalsError;

  const professionalsMap = new Map((professionals || []).map((p) => [p.id, p]));
  const owner = professionalsMap.get(ticket.userId);

  return {
    ticket: {
      ...ticket,
      userFullName: owner?.full_name || 'Desconhecido',
      userPlan: owner?.subscription_plan || 'trial',
    },
    messages: messages.map((m) => mapSupportMessage(m, professionalsMap)),
  };
}

// Upload file to storage
export async function uploadSupportAttachment(userId: string, file: File): Promise<{ attachmentName: string; attachmentUrl: string }> {
  // Sanitize file name to avoid path issues
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-').toLowerCase();
  const extension = sanitizedName.includes('.') ? sanitizedName.split('.').pop() : 'bin';
  const filePath = `support/${userId}/${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage.from('support_attachments').upload(filePath, file, {
    cacheControl: '3600',
    upsert: false,
  });

  if (error) throw error;

  const { data } = supabase.storage.from('support_attachments').getPublicUrl(filePath);

  return {
    attachmentName: file.name,
    attachmentUrl: data.publicUrl,
  };
}

// Create a new support ticket
export async function createSupportTicket(
  subject: string,
  category: SupportTicketCategory,
  description: string,
  file?: File | null
): Promise<SupportTicket> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuário não autenticado.');

  let attachmentName: string | null = null;
  let attachmentUrl: string | null = null;

  if (file) {
    const uploadResult = await uploadSupportAttachment(user.id, file);
    attachmentName = uploadResult.attachmentName;
    attachmentUrl = uploadResult.attachmentUrl;
  }

  const { data, error } = await supabase
    .from('support_tickets')
    .insert({
      user_id: user.id,
      subject: subject.trim(),
      description: description.trim(),
      category,
      attachment_name: attachmentName,
      attachment_url: attachmentUrl,
    })
    .select('*')
    .single();

  if (error || !data) throw error || new Error('Não foi possível criar o chamado.');

  // Disparar notificação de criação em background
  try {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (token) {
      void fetch('/api/support/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ticketId: data.id,
          action: 'create'
        })
      }).catch((e) => console.error('[SupportService] Falha ao notificar criação:', e));
    }
  } catch (notifErr) {
    console.error('[SupportService] Falha no fluxo de notificação:', notifErr);
  }

  return mapSupportTicket(data);
}

// Send a support message
export async function sendSupportMessage(
  ticketId: string,
  message: string,
  file?: File | null
): Promise<SupportMessage> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuário não autenticado.');

  let attachmentName: string | null = null;
  let attachmentUrl: string | null = null;

  if (file) {
    const uploadResult = await uploadSupportAttachment(user.id, file);
    attachmentName = uploadResult.attachmentName;
    attachmentUrl = uploadResult.attachmentUrl;
  }

  const { data, error } = await supabase
    .from('support_messages')
    .insert({
      ticket_id: ticketId,
      sender_id: user.id,
      message: message.trim(),
      attachment_name: attachmentName,
      attachment_url: attachmentUrl,
    })
    .select('*')
    .single();

  if (error || !data) throw error || new Error('Não foi possível enviar a mensagem.');

  // Disparar notificação de nova mensagem em background
  try {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (token) {
      void fetch('/api/support/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ticketId,
          action: 'message',
          message: message.trim()
        })
      }).catch((e) => console.error('[SupportService] Falha ao notificar mensagem:', e));
    }
  } catch (notifErr) {
    console.error('[SupportService] Falha no fluxo de notificação de mensagem:', notifErr);
  }

  // Fetch sender profile details to build return object
  const { data: prof, error: profError } = await supabase
    .from('professionals')
    .select('id, full_name, role')
    .eq('id', user.id)
    .single();

  const mockMap = new Map();
  if (!profError && prof) {
    mockMap.set(prof.id, prof);
  }

  return mapSupportMessage(data, mockMap);
}

// Update support ticket status (Admin/User action to close)
export async function updateSupportTicketStatus(ticketId: string, status: SupportTicketStatus): Promise<SupportTicket> {
  // Buscar o status anterior para detectar a transição correta
  let previousStatus: SupportTicketStatus = 'open';
  try {
    const { data: prevTicket } = await supabase
      .from('support_tickets')
      .select('status')
      .eq('id', ticketId)
      .single();
    if (prevTicket) {
      previousStatus = prevTicket.status as SupportTicketStatus;
    }
  } catch (err) {
    console.warn('[SupportService] Não foi possível verificar status anterior para notificação:', err);
  }

  const { data, error } = await supabase
    .from('support_tickets')
    .update({ status })
    .eq('id', ticketId)
    .select('*')
    .single();

  if (error || !data) throw error || new Error('Não foi possível atualizar o chamado.');

  // Disparar notificação de mudança de status em background (apenas se houve transição)
  if (previousStatus !== status) {
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (token) {
        void fetch('/api/support/notify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            ticketId,
            action: 'status_change',
            previousStatus,
            newStatus: status
          })
        }).catch((e) => console.error('[SupportService] Falha ao notificar status:', e));
      }
    } catch (notifErr) {
      console.error('[SupportService] Falha no fluxo de notificação de status:', notifErr);
    }
  }

  return mapSupportTicket(data);
}

