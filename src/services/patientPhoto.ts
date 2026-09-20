import { supabase } from '../supabaseClient';

export const PATIENT_PHOTO_BUCKET = 'patient-photos';
export const MAX_PATIENT_PHOTO_SOURCE_BYTES = 10 * 1024 * 1024;
export const PATIENT_PHOTO_SOURCE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

export const validatePatientPhotoSource = (file: File): string | null => {
  if (!PATIENT_PHOTO_SOURCE_TYPES.includes(file.type)) {
    return 'Envie uma imagem nos formatos PNG, JPG ou WEBP.';
  }
  if (file.size > MAX_PATIENT_PHOTO_SOURCE_BYTES) {
    return 'A imagem original deve ter no máximo 10 MB.';
  }
  return null;
};

export const createPatientPhotoSignedUrl = async (photoPath: string): Promise<string> => {
  if (!photoPath) return '';
  const { data, error } = await supabase.storage
    .from(PATIENT_PHOTO_BUCKET)
    .createSignedUrl(photoPath, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
};

export const uploadPatientPhoto = async ({
  professionalId,
  patientId,
  photo,
}: {
  professionalId: string;
  patientId: string;
  photo: Blob;
}): Promise<string> => {
  const photoPath = `${professionalId}/${patientId}/${Date.now()}-photo.png`;
  const { error } = await supabase.storage
    .from(PATIENT_PHOTO_BUCKET)
    .upload(photoPath, photo, {
      cacheControl: '3600',
      contentType: 'image/png',
      upsert: false,
    });
  if (error) throw error;
  return photoPath;
};

export const removePatientPhoto = async (photoPath: string): Promise<void> => {
  if (!photoPath) return;
  const { error } = await supabase.storage.from(PATIENT_PHOTO_BUCKET).remove([photoPath]);
  if (error) throw error;
};
