import { supabase } from '../supabaseClient';

export type PatientSessionStatus = 'scheduled' | 'completed' | 'cancelled' | 'missed';

export type PatientSessionSignature = {
  id: string;
  sessionId: string;
  signerType: 'patient' | 'responsible';
  signerName: string | null;
  signaturePath: string;
  signatureSha256: string;
  signedAt: string;
  revokedAt: string | null;
};

export type PatientSession = {
  id: string;
  patientId: string;
  professionalId: string;
  evolutionId: string | null;
  sessionDate: string;
  sessionTime: string | null;
  status: PatientSessionStatus;
  notes: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  signature: PatientSessionSignature | null;
};

type SessionRow = {
  id: string;
  patient_id: string;
  professional_id: string;
  evolution_id: string | null;
  session_date: string;
  session_time: string | null;
  status: PatientSessionStatus;
  notes: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type SignatureRow = {
  id: string;
  session_id: string;
  signer_type: 'patient' | 'responsible';
  signer_name: string | null;
  signature_path: string;
  signature_sha256: string;
  signed_at: string;
  revoked_at: string | null;
};

const mapSignature = (row: SignatureRow): PatientSessionSignature => ({
  id: row.id,
  sessionId: row.session_id,
  signerType: row.signer_type,
  signerName: row.signer_name,
  signaturePath: row.signature_path,
  signatureSha256: row.signature_sha256,
  signedAt: row.signed_at,
  revokedAt: row.revoked_at,
});

const mapSession = (row: SessionRow, signature?: SignatureRow): PatientSession => ({
  id: row.id,
  patientId: row.patient_id,
  professionalId: row.professional_id,
  evolutionId: row.evolution_id,
  sessionDate: row.session_date,
  sessionTime: row.session_time,
  status: row.status,
  notes: row.notes,
  deletedAt: row.deleted_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  signature: signature ? mapSignature(signature) : null,
});

export const getMonthRange = (month: Date) => {
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const iso = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return { start: iso(start), end: iso(end) };
};

export async function fetchPatientSessions(patientId: string, month: Date) {
  const { start, end } = getMonthRange(month);
  const { data: sessions, error } = await supabase
    .from('patient_sessions')
    .select('*')
    .eq('patient_id', patientId)
    .is('deleted_at', null)
    .gte('session_date', start)
    .lte('session_date', end)
    .order('session_date', { ascending: true })
    .order('session_time', { ascending: true, nullsFirst: false });
  if (error) throw error;

  const ids = (sessions || []).map((row) => row.id);
  let signatures: SignatureRow[] = [];
  if (ids.length > 0) {
    const result = await supabase
      .from('patient_session_signatures')
      .select('*')
      .in('session_id', ids)
      .is('revoked_at', null);
    if (result.error) throw result.error;
    signatures = (result.data || []) as SignatureRow[];
  }

  const bySession = new Map(signatures.map((sig) => [sig.session_id, sig]));
  return (sessions || []).map((row) => mapSession(row as SessionRow, bySession.get(row.id)));
}

export async function fetchPatientSessionSummary(patientId: string, month = new Date()) {
  const sessions = await fetchPatientSessions(patientId, month);
  return {
    total: sessions.length,
    signed: sessions.filter((item) => Boolean(item.signature)).length,
    pending: sessions.filter((item) => !item.signature && item.status === 'completed').length,
  };
}

export async function createPatientSession(input: {
  patientId: string;
  professionalId: string;
  sessionDate: string;
  sessionTime?: string | null;
  status?: PatientSessionStatus;
  notes?: string | null;
}) {
  const { data, error } = await supabase
    .from('patient_sessions')
    .insert({
      patient_id: input.patientId,
      professional_id: input.professionalId,
      session_date: input.sessionDate,
      session_time: input.sessionTime || null,
      status: input.status || 'completed',
      notes: input.notes?.trim() || null,
    })
    .select('*')
    .single();
  if (error) throw error;
  await appendSessionAudit(data.id, input.professionalId, 'created', {
    session_date: input.sessionDate,
    session_time: input.sessionTime || null,
  });
  return mapSession(data as SessionRow);
}

export async function updatePatientSession(
  session: PatientSession,
  input: { sessionDate: string; sessionTime?: string | null; status: PatientSessionStatus; notes?: string | null }
) {
  if (session.signature) {
    throw new Error('Revogue a assinatura antes de alterar os dados essenciais desta sessão.');
  }
  const { data, error } = await supabase
    .from('patient_sessions')
    .update({
      session_date: input.sessionDate,
      session_time: input.sessionTime || null,
      status: input.status,
      notes: input.notes?.trim() || null,
    })
    .eq('id', session.id)
    .select('*')
    .single();
  if (error) throw error;
  await appendSessionAudit(session.id, session.professionalId, 'updated', {
    before: { date: session.sessionDate, time: session.sessionTime, status: session.status },
    after: { date: input.sessionDate, time: input.sessionTime || null, status: input.status },
  });
  return mapSession(data as SessionRow);
}

export async function softDeletePatientSession(session: PatientSession) {
  if (session.signature) {
    throw new Error('Revogue a assinatura antes de excluir esta sessão.');
  }
  const deletedAt = new Date().toISOString();
  const { error } = await supabase
    .from('patient_sessions')
    .update({ deleted_at: deletedAt })
    .eq('id', session.id);
  if (error) throw error;
  await appendSessionAudit(session.id, session.professionalId, 'deleted', { deleted_at: deletedAt });
}

const blobToArrayBuffer = (blob: Blob) => blob.arrayBuffer();

const sha256 = async (blob: Blob) => {
  const hash = await crypto.subtle.digest('SHA-256', await blobToArrayBuffer(blob));
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
};

export async function savePatientSessionSignature(input: {
  session: PatientSession;
  signatureBlob: Blob;
  signerType: 'patient' | 'responsible';
  signerName?: string | null;
}) {
  if (input.session.signature) throw new Error('Esta sessão já possui uma assinatura ativa.');
  const userId = input.session.professionalId;
  const ext = input.signatureBlob.type === 'image/webp' ? 'webp' : 'png';
  const objectPath = `${userId}/${input.session.patientId}/${input.session.id}/${crypto.randomUUID()}.${ext}`;
  const digest = await sha256(input.signatureBlob);

  const upload = await supabase.storage
    .from('session-signatures')
    .upload(objectPath, input.signatureBlob, {
      contentType: input.signatureBlob.type || 'image/png',
      upsert: false,
      cacheControl: '3600',
    });
  if (upload.error) throw upload.error;

  const { data, error } = await supabase
    .from('patient_session_signatures')
    .insert({
      session_id: input.session.id,
      patient_id: input.session.patientId,
      professional_id: userId,
      signer_type: input.signerType,
      signer_name: input.signerName?.trim() || null,
      signature_path: objectPath,
      signature_sha256: digest,
    })
    .select('*')
    .single();

  if (error) {
    await supabase.storage.from('session-signatures').remove([objectPath]);
    throw error;
  }

  await appendSessionAudit(input.session.id, userId, 'signature_added', {
    signature_id: data.id,
    signer_type: input.signerType,
  });

  return mapSignature(data as SignatureRow);
}

export async function revokePatientSessionSignature(session: PatientSession, reason: string) {
  if (!session.signature) return;
  const revokedAt = new Date().toISOString();
  const { error } = await supabase
    .from('patient_session_signatures')
    .update({ revoked_at: revokedAt, revoked_reason: reason.trim() || 'Revogada para correção do registro.' })
    .eq('id', session.signature.id);
  if (error) throw error;
  await appendSessionAudit(session.id, session.professionalId, 'signature_revoked', {
    signature_id: session.signature.id,
    reason: reason.trim() || null,
  });
}

export async function createSignatureSignedUrl(path: string, expiresIn = 300) {
  const { data, error } = await supabase.storage
    .from('session-signatures')
    .createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

export async function appendSessionAudit(
  sessionId: string,
  professionalId: string,
  action: 'created' | 'updated' | 'signature_added' | 'signature_revoked' | 'deleted' | 'restored',
  details: Record<string, unknown> = {}
) {
  const { error } = await supabase.from('patient_session_audit').insert({
    session_id: sessionId,
    professional_id: professionalId,
    action,
    details,
  });
  if (error) console.warn('[PatientSessions] Falha ao registrar auditoria:', error);
}
