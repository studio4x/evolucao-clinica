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

export type PatientSessionMonthClosure = {
  id: string;
  patientId: string;
  professionalId: string;
  monthStart: string;
  status: 'signed';
  sessionsCount: number;
  completedSessionsCount: number;
  signedSessionsCount: number;
  snapshotHash: string;
  signatureMethod: string;
  signatureDate: string;
  signatureIp: string;
  signatureHash: string;
  signedByName: string;
  signedByRegister: string;
  createdAt: string;
};

type MonthClosureRow = {
  id: string;
  patient_id: string;
  professional_id: string;
  month_start: string;
  status: 'signed';
  sessions_count: number;
  completed_sessions_count: number;
  signed_sessions_count: number;
  snapshot_hash: string;
  signature_method: string;
  signature_date: string;
  signature_ip: string;
  signature_hash: string;
  signed_by_name: string;
  signed_by_register: string;
  created_at: string;
};

const mapMonthClosure = (row: MonthClosureRow): PatientSessionMonthClosure => ({
  id: row.id,
  patientId: row.patient_id,
  professionalId: row.professional_id,
  monthStart: row.month_start,
  status: row.status,
  sessionsCount: row.sessions_count,
  completedSessionsCount: row.completed_sessions_count,
  signedSessionsCount: row.signed_sessions_count,
  snapshotHash: row.snapshot_hash,
  signatureMethod: row.signature_method,
  signatureDate: row.signature_date,
  signatureIp: row.signature_ip,
  signatureHash: row.signature_hash,
  signedByName: row.signed_by_name,
  signedByRegister: row.signed_by_register,
  createdAt: row.created_at,
});

const getMonthStart = (month: Date) =>
  `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-01`;

export async function fetchPatientSessionMonthClosure(patientId: string, month: Date) {
  const { data, error } = await supabase
    .from('patient_session_month_closures')
    .select('*')
    .eq('patient_id', patientId)
    .eq('month_start', getMonthStart(month))
    .maybeSingle();
  if (error) throw error;
  return data ? mapMonthClosure(data as MonthClosureRow) : null;
}

export async function closePatientSessionMonth(input: {
  patientId: string;
  professionalId: string;
  month: Date;
}) {
  const { data, error } = await supabase
    .from('patient_session_month_closures')
    .insert({
      patient_id: input.patientId,
      professional_id: input.professionalId,
      month_start: getMonthStart(input.month),
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapMonthClosure(data as MonthClosureRow);
}

export type PatientSession = {
  id: string;
  patientId: string;
  professionalId: string;
  evolutionId: string | null;
  packageId: string | null;
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
  package_id: string | null;
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
  packageId: row.package_id,
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
  evolutionId?: string | null;
  packageId?: string | null;
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
      evolution_id: input.evolutionId || null,
      package_id: input.packageId || null,
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
  input: { sessionDate: string; sessionTime?: string | null; status: PatientSessionStatus; notes?: string | null; evolutionId?: string | null; packageId?: string | null }
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
      evolution_id: input.evolutionId || null,
      package_id: input.packageId || null,
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


export type PatientSessionPackage = {
  id: string;
  patientId: string;
  professionalId: string;
  label: string;
  targetSessions: number;
  status: 'active' | 'completed' | 'cancelled';
  startsOn: string;
  completedAt: string | null;
  createdAt: string;
  completedSessions: number;
};

export async function fetchPatientSessionsRange(patientId: string, start: string, end: string) {
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

export async function fetchPatientSessionPackages(patientId: string) {
  const { data: packages, error } = await supabase
    .from('patient_session_packages')
    .select('*')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (!packages?.length) return [] as PatientSessionPackage[];

  const packageIds = packages.map((item) => item.id);
  const { data: packageSessions, error: sessionError } = await supabase
    .from('patient_sessions')
    .select('package_id, status, deleted_at')
    .in('package_id', packageIds);
  if (sessionError) throw sessionError;

  return packages.map((item) => ({
    id: item.id,
    patientId: item.patient_id,
    professionalId: item.professional_id,
    label: item.label,
    targetSessions: item.target_sessions,
    status: item.status,
    startsOn: item.starts_on,
    completedAt: item.completed_at,
    createdAt: item.created_at,
    completedSessions: (packageSessions || []).filter(
      (session) => session.package_id === item.id && session.status === 'completed' && !session.deleted_at
    ).length,
  })) as PatientSessionPackage[];
}

export async function createPatientSessionPackage(input: {
  patientId: string;
  professionalId: string;
  targetSessions: number;
  label?: string;
}) {
  const { data, error } = await supabase
    .from('patient_session_packages')
    .insert({
      patient_id: input.patientId,
      professional_id: input.professionalId,
      target_sessions: input.targetSessions,
      label: input.label?.trim() || 'Pacote de sessões',
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function cancelPatientSessionPackage(packageId: string) {
  const { error } = await supabase
    .from('patient_session_packages')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', packageId)
    .eq('status', 'active');
  if (error) throw error;
}
