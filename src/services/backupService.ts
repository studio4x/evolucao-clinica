import { supabase } from '../supabaseClient';
import { 
  createGoogleFolder, 
  listGoogleFiles, 
  uploadJsonToGoogleDrive, 
  downloadGoogleFileContent, 
  listBackupFilesFromGoogleDrive,
  deleteGoogleFile
} from './googleDocs';

export interface BackupPreferences {
  autoBackupEnabled: boolean;
  backupFrequency: 'daily' | 'weekly' | 'monthly';
  lastBackupAt: string | null;
}

/**
 * Busca todas as preferências de backup do profissional
 */
export async function getBackupPreferences(userId: string): Promise<BackupPreferences> {
  const { data, error } = await supabase
    .from('professionals')
    .select('auto_backup_enabled, backup_frequency, last_backup_at')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('[BackupService] Erro ao buscar preferências de backup:', error);
    return { autoBackupEnabled: false, backupFrequency: 'monthly', lastBackupAt: null };
  }

  return {
    autoBackupEnabled: data?.auto_backup_enabled || false,
    backupFrequency: (data?.backup_frequency as 'daily' | 'weekly' | 'monthly') || 'monthly',
    lastBackupAt: data?.last_backup_at || null
  };
}

/**
 * Atualiza o status e a frequência do backup automático no Supabase
 */
export async function updateBackupPreferences(
  userId: string, 
  autoBackupEnabled: boolean,
  backupFrequency: 'daily' | 'weekly' | 'monthly'
): Promise<void> {
  const { error } = await supabase
    .from('professionals')
    .update({
      auto_backup_enabled: autoBackupEnabled,
      backup_frequency: backupFrequency,
      updated_at: new Date().toISOString()
    })
    .eq('id', userId);

  if (error) {
    throw error;
  }
}

/**
 * Atualiza a data do último backup realizado no Supabase
 */
async function updateLastBackupTimestamp(userId: string): Promise<void> {
  const { error } = await supabase
    .from('professionals')
    .update({
      last_backup_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', userId);

  if (error) {
    console.error('[BackupService] Falha ao salvar timestamp de backup:', error);
  }
}

/**
 * Gera a string JSON consolidada contendo todas as configurações da conta, pacientes e prontuários
 */
export async function generateBackupJson(userId: string): Promise<string> {
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
      auto_backup_enabled: professional.auto_backup_enabled,
      backup_frequency: professional.backup_frequency
    },
    patients: patients || [],
    evolutions: evolutions,
    reports: reports
  };

  return JSON.stringify(backupObject, null, 2);
}

/**
 * Executa o download imediato do arquivo JSON no navegador
 */
export async function downloadBackupJsonLocal(userId: string, professionalName: string): Promise<void> {
  const jsonString = await generateBackupJson(userId);
  const dateStr = new Date().toISOString().split('T')[0];
  const cleanName = professionalName.trim().replace(/[\/\\?%*:|"<>\s]+/g, '_');
  const filename = `EvolucaoClinica_Backup_${cleanName}_${dateStr}.json`;

  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

/**
 * Envia o backup JSON para o Google Drive com controle de retenção de 3 versões
 */
export async function uploadBackupToGoogleDrive(
  googleAccessToken: string,
  jsonString: string,
  professionalName: string
): Promise<any> {
  // 1. Procurar ou criar pasta raiz "Evolução Clínica - Backups"
  const folderName = 'Evolução Clínica - Backups';
  const files = await listGoogleFiles(googleAccessToken, 'root', folderName, true);
  
  let targetFolderId = '';
  const exactFolder = files.find((f: any) => f.name === folderName);
  
  if (exactFolder) {
    targetFolderId = exactFolder.id;
  } else {
    const newFolder = await createGoogleFolder(googleAccessToken, folderName);
    targetFolderId = newFolder.id;
  }

  // 2. Rotação de backup (manter no máximo 3 versões anteriores no Drive)
  // Listar arquivos de backup existentes na pasta
  const existingBackups = await listBackupFilesFromGoogleDrive(googleAccessToken, targetFolderId);
  
  // Como vamos fazer o upload de uma nova versão, se já existem 3 ou mais, deletamos os mais antigos
  // de forma que restem apenas 2 antes do upload, totalizando 3 após o upload.
  if (existingBackups && existingBackups.length >= 3) {
    console.log(`[BackupService] Encontradas ${existingBackups.length} versões no Drive. Deletando as mais antigas para manter o limite de 3...`);
    // O array está ordenado por data de criação decrescente, então o index 0 e 1 são os mais novos.
    // Qualquer arquivo do index 2 em diante deve ser deletado.
    for (let i = 2; i < existingBackups.length; i++) {
      try {
        await deleteGoogleFile(googleAccessToken, existingBackups[i].id);
        console.log(`[BackupService] Deletado backup antigo ID: ${existingBackups[i].id}`);
      } catch (delErr) {
        console.error(`[BackupService] Erro ao deletar backup antigo ID ${existingBackups[i].id}:`, delErr);
      }
    }
  }

  // 3. Gerar nome do arquivo com timestamp completo para evitar conflitos de nomes
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}-${String(now.getSeconds()).padStart(2, '0')}`;
  const cleanName = professionalName.trim().replace(/[\/\\?%*:|"<>\s]+/g, '_');
  const filename = `EvolucaoClinica_Backup_${cleanName}_${dateStr}_${timeStr}.json`;

  // 4. Executar o upload do JSON
  return await uploadJsonToGoogleDrive(googleAccessToken, jsonString, filename, targetFolderId);
}

/**
 * Restaura as configurações, pacientes e prontuários a partir de um backup JSON do Drive
 */
export async function restoreBackupFromDrive(
  googleAccessToken: string,
  fileId: string,
  userId: string
): Promise<{ patientsCount: number; evolutionsCount: number; reportsCount: number }> {
  // 1. Fazer o download do conteúdo JSON do Drive
  const jsonText = await downloadGoogleFileContent(googleAccessToken, fileId);
  const backupData = JSON.parse(jsonText);

  // 2. Validação simples de segurança
  if (!backupData || backupData.version !== '1.0' || !Array.isArray(backupData.patients)) {
    throw new Error('O arquivo de backup é inválido ou está corrompido.');
  }

  // 3. Restaurar dados do profissional (apenas se for o mesmo profissional)
  if (backupData.professional && backupData.professional.id === userId) {
    const { error: profError } = await supabase
      .from('professionals')
      .update({
        full_name: backupData.professional.full_name,
        professional_title: backupData.professional.professional_title,
        professional_register: backupData.professional.professional_register,
        custom_logo_url: backupData.professional.custom_logo_url,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (profError) {
      console.warn('[BackupService] Aviso ao restaurar dados do perfil:', profError.message);
    }
  }

  // 4. Restaurar Pacientes (upsert em lote)
  let patientsRestored = 0;
  if (backupData.patients.length > 0) {
    // Forçar professional_id para o usuário atual para evitar injeções
    const sanitizedPatients = backupData.patients.map((p: any) => ({
      ...p,
      professional_id: userId,
      updated_at: new Date().toISOString()
    }));

    const { error: patError } = await supabase
      .from('patients')
      .upsert(sanitizedPatients);

    if (patError) throw new Error(`Falha ao restaurar pacientes: ${patError.message}`);
    patientsRestored = sanitizedPatients.length;
  }

  // 5. Restaurar Evoluções (upsert em lote)
  let evolutionsRestored = 0;
  if (backupData.evolutions && backupData.evolutions.length > 0) {
    const evoIds = backupData.evolutions.map((e: any) => e.id).filter(Boolean);
    
    // Buscar evoluções já existentes no banco de dados e seus respectivos status
    const { data: existingEvos, error: fetchError } = await supabase
      .from('evolutions')
      .select('id, status')
      .in('id', evoIds);

    if (fetchError) {
      console.warn('[BackupService] Erro ao verificar evoluções existentes:', fetchError.message);
    }

    const signedEvoIdsInDb = new Set(
      (existingEvos || [])
        .filter((e: any) => e.status === 'signed')
        .map((e: any) => e.id)
    );

    // Filtrar para remover evoluções que já estão assinadas no banco de dados (que disparariam o trigger de proteção)
    const evolutionsToUpsert = backupData.evolutions.filter((e: any) => !signedEvoIdsInDb.has(e.id));

    if (evolutionsToUpsert.length > 0) {
      const { error: evoError } = await supabase
        .from('evolutions')
        .upsert(evolutionsToUpsert);

      if (evoError) throw new Error(`Falha ao restaurar evoluções: ${evoError.message}`);
      evolutionsRestored = evolutionsToUpsert.length;
    } else {
      console.log('[BackupService] Todas as evoluções já estavam assinadas no banco de dados. Upsert de evoluções ignorado para proteção.');
    }
  }

  // 6. Restaurar Relatórios e PDIs (upsert em lote)
  let reportsRestored = 0;
  if (backupData.reports && backupData.reports.length > 0) {
    // Garantir professional_id atual
    const sanitizedReports = backupData.reports.map((r: any) => ({
      ...r,
      professional_id: userId
    }));

    const repIds = sanitizedReports.map((r: any) => r.id).filter(Boolean);

    // Buscar relatórios já existentes no banco de dados e seus respectivos status
    const { data: existingReps, error: fetchRepError } = await supabase
      .from('patient_reports')
      .select('id, status')
      .in('id', repIds);

    if (fetchRepError) {
      console.warn('[BackupService] Erro ao verificar relatórios existentes:', fetchRepError.message);
    }

    const signedRepIdsInDb = new Set(
      (existingReps || [])
        .filter((r: any) => r.status === 'signed')
        .map((r: any) => r.id)
    );

    // Filtrar para remover relatórios que já estão assinadas no banco de dados (que disparariam o trigger de proteção)
    const reportsToUpsert = sanitizedReports.filter((r: any) => !signedRepIdsInDb.has(r.id));

    if (reportsToUpsert.length > 0) {
      const { error: repError } = await supabase
        .from('patient_reports')
        .upsert(reportsToUpsert);

      if (repError) throw new Error(`Falha ao restaurar relatórios: ${repError.message}`);
      reportsRestored = reportsToUpsert.length;
    } else {
      console.log('[BackupService] Todos os relatórios já estavam assinados no banco de dados. Upsert de relatórios ignorado para proteção.');
    }
  }

  return {
    patientsCount: patientsRestored,
    evolutionsCount: evolutionsRestored,
    reportsCount: reportsRestored
  };
}

/**
 * Busca a lista dos backups disponíveis no Drive
 */
export async function getBackupsListFromDrive(googleAccessToken: string): Promise<any[]> {
  const folderName = 'Evolução Clínica - Backups';
  const files = await listGoogleFiles(googleAccessToken, 'root', folderName, true);
  
  const exactFolder = files.find((f: any) => f.name === folderName);
  if (!exactFolder) return [];

  return await listBackupFilesFromGoogleDrive(googleAccessToken, exactFolder.id);
}

/**
 * Executa o backup automático periódico baseado na frequência configurada
 */
export async function runAutoBackupIfNeeded(
  userId: string,
  googleAccessToken: string | null | undefined,
  professionalName: string
): Promise<void> {
  if (!googleAccessToken) return;

  try {
    const prefs = await getBackupPreferences(userId);
    if (!prefs.autoBackupEnabled) return;

    // Calcular o intervalo baseado na frequência
    let intervalMs = 30 * 24 * 60 * 60 * 1000; // mensal (padrão)
    if (prefs.backupFrequency === 'daily') {
      intervalMs = 24 * 60 * 60 * 1000; // diário
    } else if (prefs.backupFrequency === 'weekly') {
      intervalMs = 7 * 24 * 60 * 60 * 1000; // semanal
    }

    const now = Date.now();
    const lastBackupTime = prefs.lastBackupAt ? new Date(prefs.lastBackupAt).getTime() : 0;

    if (now - lastBackupTime >= intervalMs) {
      console.log(`[BackupService] Executando backup automático (${prefs.backupFrequency}) para o Drive...`);
      const jsonString = await generateBackupJson(userId);
      await uploadBackupToGoogleDrive(googleAccessToken, jsonString, professionalName);
      await updateLastBackupTimestamp(userId);
      
      // Inserir notificação de sucesso no sistema
      const freqText = prefs.backupFrequency === 'daily' ? 'diária' : prefs.backupFrequency === 'weekly' ? 'semanal' : 'mensal';
      await supabase
        .from('notifications')
        .insert({
          user_id: userId,
          title: 'Backup automático concluído',
          message: `A sincronização de segurança ${freqText} dos seus prontuários no Google Drive foi realizada com sucesso.`,
          type: 'success',
          link: '/painel/profile'
        });

      console.log('[BackupService] Backup automático periódico concluído com sucesso e notificação gerada!');
    }
  } catch (err) {
    console.error('[BackupService] Erro ao rodar backup automático em background:', err);
  }
}
