import type { SupabaseClient } from "@supabase/supabase-js";

export async function buildPersonalBackupJson(supabase: SupabaseClient, userId: string): Promise<string> {
  // 1. Obter dados do profissional
  const { data: professional, error: profError } = await supabase
    .from('professionals')
    .select('*')
    .eq('id', userId)
    .single();

  if (profError) throw new Error(`Erro ao buscar dados do profissional: ${profError.message}`);

  // 2. Obter todos os pacientes
  const { data: patients, error: pError } = await supabase
    .from('patients')
    .select('*')
    .eq('professional_id', userId)
    .order('full_name', { ascending: true });

  if (pError) throw new Error(`Erro ao buscar pacientes: ${pError.message}`);

  let evolutions: any[] = [];
  let reports: any[] = [];

  if (patients && patients.length > 0) {
    const patientIds = patients.map((p) => p.id);

    // 3. Obter todas as evoluções clínicas
    const { data: evos, error: eError } = await supabase
      .from('evolutions')
      .select('*')
        .is('organization_id', null)
      .in('patient_id', patientIds)
      .order('session_date', { ascending: false });

    if (eError) throw new Error(`Erro ao buscar evoluções: ${eError.message}`);
    evolutions = evos || [];

    // 4. Obter todos os relatórios e PDIs
    const { data: reps, error: rError } = await supabase
      .from('patient_reports')
      .select('*')
      .in('patient_id', patientIds)
      .order('created_at', { ascending: false });

    if (rError) throw new Error(`Erro ao buscar relatórios: ${rError.message}`);
    reports = reps || [];
  }

  // 5. Estruturar o objeto de backup
  const backupObject = {
    version: '1.0',
    exported_at: new Date().toISOString(),
    professional: {
      id: professional.id,
      full_name: professional.full_name,
      professional_title: professional.professional_title,
      professional_register: professional.professional_register,
      custom_logo_url: professional.custom_logo_url,
      custom_logo_settings: professional.custom_logo_settings,
      auto_backup_enabled: professional.auto_backup_enabled,
      backup_frequency: professional.backup_frequency
    },
    patients: patients || [],
    evolutions: evolutions,
    reports: reports
  };

  return JSON.stringify(backupObject, null, 2);
}
