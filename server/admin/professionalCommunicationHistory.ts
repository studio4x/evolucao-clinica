export type ProfessionalCommunicationChannel = "all" | "email" | "notification" | "whatsapp";

export type ProfessionalCommunicationItem = {
  id: string;
  channel: Exclude<ProfessionalCommunicationChannel, "all">;
  title: string;
  message: string;
  status: string;
  source: string | null;
  createdAt: string;
  readAt: string | null;
  deliveredAt: string | null;
  errorMessage: string | null;
  metadata: {
    provider?: string | null;
    recipient?: string | null;
    messageType?: string | null;
    templateName?: string | null;
    attemptCount?: number | null;
    link?: string | null;
  };
};

type HistoryQuery = {
  channel: ProfessionalCommunicationChannel;
  page: number;
  pageSize: number;
};

type ChannelResult = {
  items: ProfessionalCommunicationItem[];
  count: number;
};

const CHANNELS = new Set<ProfessionalCommunicationChannel>(["all", "email", "notification", "whatsapp"]);

export function parseProfessionalCommunicationHistoryQuery(query: Record<string, unknown>): HistoryQuery {
  const requestedChannel = String(query.channel || "all").trim().toLowerCase() as ProfessionalCommunicationChannel;
  const channel = CHANNELS.has(requestedChannel) ? requestedChannel : "all";
  const requestedPage = Number.parseInt(String(query.page || "1"), 10);
  const requestedPageSize = Number.parseInt(String(query.pageSize || "10"), 10);

  return {
    channel,
    page: Number.isFinite(requestedPage) ? Math.max(1, requestedPage) : 1,
    pageSize: Number.isFinite(requestedPageSize) ? Math.min(50, Math.max(1, requestedPageSize)) : 10
  };
}

const asText = (value: unknown) => value === null || value === undefined ? "" : String(value);
const nullableText = (value: unknown) => {
  const normalized = asText(value).trim();
  return normalized || null;
};

const maskPhone = (phone: unknown) => {
  const digits = asText(phone).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length <= 4) return "••••";
  return `${"•".repeat(Math.max(4, digits.length - 4))}${digits.slice(-4)}`;
};

export function normalizeEmailCommunication(row: Record<string, any>): ProfessionalCommunicationItem {
  return {
    id: `email:${row.id}`,
    channel: "email",
    title: asText(row.subject) || "E-mail sem assunto",
    message: asText(row.message),
    status: asText(row.status) || "sent",
    source: nullableText(row.source),
    createdAt: asText(row.created_at),
    readAt: null,
    deliveredAt: row.status === "sent" ? asText(row.created_at) : null,
    errorMessage: nullableText(row.error_message),
    metadata: {
      provider: nullableText(row.provider),
      recipient: nullableText(row.recipient_email)
    }
  };
}

export function normalizeNotificationCommunication(row: Record<string, any>): ProfessionalCommunicationItem {
  return {
    id: `notification:${row.id}`,
    channel: "notification",
    title: asText(row.title) || "Notificação sem título",
    message: asText(row.message),
    status: row.read_at ? "read" : "available",
    source: nullableText(row.source),
    createdAt: asText(row.created_at),
    readAt: nullableText(row.read_at),
    deliveredAt: null,
    errorMessage: null,
    metadata: {
      link: nullableText(row.link)
    }
  };
}

export function normalizeWhatsAppCommunication(row: Record<string, any>): ProfessionalCommunicationItem {
  const templateName = nullableText(row.template_name);
  const messageType = nullableText(row.message_type);
  return {
    id: `whatsapp:${row.id}`,
    channel: "whatsapp",
    title: templateName ? `Template ${templateName}` : "Mensagem de WhatsApp",
    message: templateName
      ? "Mensagem enviada com um template aprovado pela Meta."
      : `Mensagem registrada como ${messageType || "WhatsApp"}.`,
    status: asText(row.status) || "pending",
    source: row.lifecycle_dispatch_id ? "lifecycle" : "platform",
    createdAt: asText(row.created_at),
    readAt: nullableText(row.read_at),
    deliveredAt: nullableText(row.delivered_at || row.sent_at || row.accepted_at),
    errorMessage: nullableText(row.error_message || row.error_title || row.error_code),
    metadata: {
      recipient: maskPhone(row.recipient_phone),
      messageType,
      templateName,
      attemptCount: Number.isFinite(Number(row.attempt_count)) ? Number(row.attempt_count) : null
    }
  };
}

const timestamp = (value: string) => {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

export function paginateProfessionalCommunications(
  items: ProfessionalCommunicationItem[],
  page: number,
  pageSize: number
) {
  const sorted = [...items].sort((left, right) => timestamp(right.createdAt) - timestamp(left.createdAt));
  const from = (page - 1) * pageSize;
  return sorted.slice(from, from + pageSize);
}

async function loadEmailHistory(deps: any, professionalId: string, query: HistoryQuery): Promise<ChannelResult> {
  const includeItems = query.channel === "all" || query.channel === "email";
  if (!includeItems) {
    const { count, error } = await deps.supabaseAdmin
      .from("email_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", professionalId);
    if (error) throw error;
    return { items: [], count: count || 0 };
  }

  const from = query.channel === "all" ? 0 : (query.page - 1) * query.pageSize;
  const size = query.channel === "all" ? query.page * query.pageSize : query.pageSize;
  const { data, count, error } = await deps.supabaseAdmin
    .from("email_deliveries")
    .select("id, recipient_email, subject, message, provider, source, status, error_message, created_at", { count: "exact" })
    .eq("user_id", professionalId)
    .order("created_at", { ascending: false })
    .range(from, from + size - 1);
  if (error) throw error;
  return { items: (data || []).map(normalizeEmailCommunication), count: count || 0 };
}

async function loadNotificationHistory(deps: any, professionalId: string, query: HistoryQuery): Promise<ChannelResult> {
  const includeItems = query.channel === "all" || query.channel === "notification";
  if (!includeItems) {
    const { count, error } = await deps.supabaseAdmin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", professionalId);
    if (error) throw error;
    return { items: [], count: count || 0 };
  }

  const from = query.channel === "all" ? 0 : (query.page - 1) * query.pageSize;
  const size = query.channel === "all" ? query.page * query.pageSize : query.pageSize;
  const { data, count, error } = await deps.supabaseAdmin
    .from("notifications")
    .select("id, title, message, source, link, read_at, created_at", { count: "exact" })
    .eq("user_id", professionalId)
    .order("created_at", { ascending: false })
    .range(from, from + size - 1);
  if (error) throw error;
  return { items: (data || []).map(normalizeNotificationCommunication), count: count || 0 };
}

async function loadWhatsAppHistory(deps: any, professionalId: string, query: HistoryQuery): Promise<ChannelResult> {
  const includeItems = query.channel === "all" || query.channel === "whatsapp";
  if (!includeItems) {
    const { count, error } = await deps.supabaseAdmin
      .from("whatsapp_message_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("user_id", professionalId);
    if (error) throw error;
    return { items: [], count: count || 0 };
  }

  const from = query.channel === "all" ? 0 : (query.page - 1) * query.pageSize;
  const size = query.channel === "all" ? query.page * query.pageSize : query.pageSize;
  const { data, count, error } = await deps.supabaseAdmin
    .from("whatsapp_message_deliveries")
    .select("id, recipient_phone, lifecycle_dispatch_id, message_type, template_name, status, error_code, error_title, error_message, attempt_count, accepted_at, sent_at, delivered_at, read_at, failed_at, created_at", { count: "exact" })
    .eq("user_id", professionalId)
    .order("created_at", { ascending: false })
    .range(from, from + size - 1);
  if (error) throw error;
  return { items: (data || []).map(normalizeWhatsAppCommunication), count: count || 0 };
}

export async function getProfessionalCommunicationHistory(
  deps: { supabaseAdmin: any },
  professionalId: string,
  query: HistoryQuery
) {
  const [emails, notifications, whatsapp] = await Promise.all([
    loadEmailHistory(deps, professionalId, query),
    loadNotificationHistory(deps, professionalId, query),
    loadWhatsAppHistory(deps, professionalId, query)
  ]);
  const counts = {
    email: emails.count,
    notification: notifications.count,
    whatsapp: whatsapp.count
  };
  const total = query.channel === "all"
    ? counts.email + counts.notification + counts.whatsapp
    : counts[query.channel];
  const combined = [...emails.items, ...notifications.items, ...whatsapp.items];
  const items = query.channel === "all"
    ? paginateProfessionalCommunications(combined, query.page, query.pageSize)
    : combined;

  return {
    items,
    counts: { all: counts.email + counts.notification + counts.whatsapp, ...counts },
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize))
    }
  };
}
