import { supabase } from '../supabaseClient';
import type { PatientFileTypeKey } from '../utils/patientFileTypes';

export type PatientFileRecord = {
  id: string;
  patientId: string;
  googleDriveFileId: string;
  googleDriveWebViewLink: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  fileTypeKey: PatientFileTypeKey;
  fileTypeLabel: string;
  createdAt: string;
  updatedAt: string;
};

type PatientFileRow = {
  id: string;
  patient_id: string;
  google_drive_file_id: string;
  google_drive_web_view_link: string;
  original_file_name: string;
  mime_type: string;
  size_bytes: number | string | null;
  file_type_key: PatientFileTypeKey;
  file_type_label: string;
  created_at: string;
  updated_at: string;
};

const mapPatientFile = (row: PatientFileRow): PatientFileRecord => ({
  id: row.id,
  patientId: row.patient_id,
  googleDriveFileId: row.google_drive_file_id,
  googleDriveWebViewLink: row.google_drive_web_view_link,
  originalFileName: row.original_file_name,
  mimeType: row.mime_type,
  sizeBytes: Number(row.size_bytes || 0),
  fileTypeKey: row.file_type_key,
  fileTypeLabel: row.file_type_label,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export async function listPatientFiles(patientId: string) {
  const { data, error } = await supabase
    .from('patient_files')
    .select('*')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map((row) => mapPatientFile(row as PatientFileRow));
}

export async function createPatientFile(input: {
  patientId: string;
  googleDriveFileId: string;
  googleDriveWebViewLink: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  fileTypeKey: PatientFileTypeKey;
  fileTypeLabel: string;
}) {
  const { data, error } = await supabase
    .from('patient_files')
    .insert({
      patient_id: input.patientId,
      google_drive_file_id: input.googleDriveFileId,
      google_drive_web_view_link: input.googleDriveWebViewLink,
      original_file_name: input.originalFileName,
      mime_type: input.mimeType,
      size_bytes: input.sizeBytes,
      file_type_key: input.fileTypeKey,
      file_type_label: input.fileTypeLabel.trim(),
    })
    .select('*')
    .single();

  if (error) throw error;
  return mapPatientFile(data as PatientFileRow);
}

export async function updatePatientFileType(
  id: string,
  fileTypeKey: PatientFileTypeKey,
  fileTypeLabel: string
) {
  const { data, error } = await supabase
    .from('patient_files')
    .update({
      file_type_key: fileTypeKey,
      file_type_label: fileTypeLabel.trim(),
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return mapPatientFile(data as PatientFileRow);
}

export async function deletePatientFileRecord(id: string) {
  const { error } = await supabase
    .from('patient_files')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
