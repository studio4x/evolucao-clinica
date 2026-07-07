import { supabase } from '../supabaseClient';

export interface MigrationRequest {
  id: string;
  userId: string;
  previousPlatform: string;
  otherPlatformName: string | null;
  estimatedPatients: number;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  attachmentUrl: string | null;
  attachmentName: string | null;
  notes: string | null;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
  professionalName?: string;
  professionalEmail?: string;
}

const SUPPORT_ATTACHMENTS_BUCKET = 'support_attachments';
const SIGNED_URL_TTL = 3600; // 1 hour

// Resolves a private storage path to a temporary signed URL
export async function getMigrationAttachmentUrl(filePath: string | null): Promise<string | null> {
  if (!filePath) return null;

  // If it's already a full HTTP URL, return it
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
    return filePath;
  }

  const { data, error } = await supabase.storage
    .from(SUPPORT_ATTACHMENTS_BUCKET)
    .createSignedUrl(filePath, SIGNED_URL_TTL);

  if (error || !data?.signedUrl) {
    console.warn('[MigrationService] Falha ao gerar URL assinada do anexo:', error);
    return null;
  }

  return data.signedUrl;
}

// Fetch migration requests for the logged in user
export async function fetchMyMigrationRequests(): Promise<MigrationRequest[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuário não autenticado.');

  const { data, error } = await supabase
    .from('migration_requests')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []).map(mapMigrationRequest);
}

// Create a new migration request
export async function createMigrationRequest(
  previousPlatform: string,
  otherPlatformName: string | null,
  estimatedPatients: number,
  notes: string | null,
  file?: File | null
): Promise<MigrationRequest> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuário não autenticado.');

  let attachmentName: string | null = null;
  let attachmentUrl: string | null = null;

  if (file) {
    // Sanitize file name to avoid path issues
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]+/g, '-').toLowerCase();
    const extension = sanitizedName.includes('.') ? sanitizedName.split('.').pop() : 'bin';
    const filePath = `support/${user.id}/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(SUPPORT_ATTACHMENTS_BUCKET)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) throw uploadError;

    attachmentName = file.name;
    attachmentUrl = filePath;
  }

  const { data, error } = await supabase
    .from('migration_requests')
    .insert({
      user_id: user.id,
      previous_platform: previousPlatform,
      other_platform_name: otherPlatformName,
      estimated_patients: estimatedPatients,
      notes: notes,
      attachment_url: attachmentUrl,
      attachment_name: attachmentName,
      status: 'pending'
    })
    .select('*')
    .single();

  if (error) throw error;

  const mapped = mapMigrationRequest(data);

  // Send notification calling backend api
  try {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (token) {
      await fetch('/api/migrations/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          requestId: mapped.id,
          action: 'create'
        })
      });
    }
  } catch (err) {
    console.error('Erro ao chamar notificação de migração:', err);
  }

  return mapped;
}

// Fetch all migration requests (Admin only)
export async function fetchAdminMigrationRequests(): Promise<MigrationRequest[]> {
  const { data, error } = await supabase
    .from('migration_requests')
    .select(`
      *,
      professionals:user_id (
        full_name,
        google_email
      )
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []).map((item: any) => {
    const mapped = mapMigrationRequest(item);
    if (item.professionals) {
      mapped.professionalName = (item.professionals as any).full_name;
      mapped.professionalEmail = (item.professionals as any).google_email;
    }
    return mapped;
  });
}

// Update status of migration request (Admin only)
export async function updateMigrationRequestStatus(
  requestId: string,
  newStatus: 'pending' | 'in_progress' | 'completed' | 'cancelled',
  adminNotes: string | null
): Promise<MigrationRequest> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuário não autenticado.');

  const { data: original } = await supabase
    .from('migration_requests')
    .select('status')
    .eq('id', requestId)
    .single();

  const previousStatus = original?.status || 'pending';

  const { data, error } = await supabase
    .from('migration_requests')
    .update({
      status: newStatus,
      admin_notes: adminNotes,
      updated_at: new Date().toISOString()
    })
    .eq('id', requestId)
    .select('*')
    .single();

  if (error) throw error;

  const mapped = mapMigrationRequest(data);

  // Send notification calling backend api
  try {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (token) {
      await fetch('/api/migrations/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          requestId: mapped.id,
          action: 'status_change',
          previousStatus,
          newStatus
        })
      });
    }
  } catch (err) {
    console.error('Erro ao chamar notificação de migração para alteração de status:', err);
  }

  return mapped;
}

// Helper to map DB row to TS interface
function mapMigrationRequest(row: any): MigrationRequest {
  return {
    id: row.id,
    userId: row.user_id,
    previousPlatform: row.previous_platform,
    otherPlatformName: row.other_platform_name,
    estimatedPatients: row.estimated_patients,
    status: row.status,
    attachmentUrl: row.attachment_url,
    attachmentName: row.attachment_name,
    notes: row.notes,
    adminNotes: row.admin_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
