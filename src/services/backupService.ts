import JSZip from 'jszip';
import { supabase } from '../supabaseClient';
import { createGoogleFolder, listGoogleFiles, uploadZipToGoogleDrive } from './googleDocs';

// Helper para formatar data (DD-MM-AAAA)
const formatBackupDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return 'sem_data';
  // Se for YYYY-MM-DD
  if (dateStr.includes('-') && !dateStr.includes('T')) {
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  // Se for ISO string ou similar
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'data_invalida';
  return date.toLocaleDateString('pt-BR').replace(/\//g, '-');
};

// Interface para preferências de backup
export interface BackupPreferences {
  autoBackupEnabled: boolean;
  lastBackupAt: string | null;
}

/**
 * Busca todas as preferências de backup do profissional
 */
export async function getBackupPreferences(userId: string): Promise<BackupPreferences> {
  const { data, error } = await supabase
    .from('professionals')
    .select('auto_backup_enabled, last_backup_at')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('[BackupService] Erro ao buscar preferências de backup:', error);
    return { autoBackupEnabled: false, lastBackupAt: null };
  }

  return {
    autoBackupEnabled: data?.auto_backup_enabled || false,
    lastBackupAt: data?.last_backup_at || null
  };
}

/**
 * Atualiza o status do backup automático no Supabase
 */
export async function updateBackupPreferences(userId: string, autoBackupEnabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('professionals')
    .update({
      auto_backup_enabled: autoBackupEnabled,
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
 * Gera o arquivo ZIP contendo todos os prontuários e relatórios dos pacientes em memória
 */
export async function generateBackupZip(userId: string): Promise<Blob> {
  // 1. Obter todos os pacientes
  const { data: patients, error: pError } = await supabase
    .from('patients')
    .select('*')
    .eq('professional_id', userId)
    .order('full_name', { ascending: true });

  if (pError) throw new Error(`Erro ao buscar pacientes: ${pError.message}`);
  if (!patients || patients.length === 0) {
    throw new Error('Nenhum paciente cadastrado para gerar backup.');
  }

  const patientIds = patients.map((p) => p.id);

  // 2. Obter todas as evoluções clínicas
  const { data: evolutions, error: eError } = await supabase
    .from('evolutions')
    .select('*')
    .in('patient_id', patientIds)
    .order('session_date', { ascending: false });

  if (eError) throw new Error(`Erro ao buscar evoluções: ${eError.message}`);

  // 3. Obter todos os relatórios e PDIs
  const { data: reports, error: rError } = await supabase
    .from('patient_reports')
    .select('*')
    .in('patient_id', patientIds)
    .order('created_at', { ascending: false });

  if (rError) throw new Error(`Erro ao buscar relatórios: ${rError.message}`);

  // 4. Instanciar o JSZip
  const zip = new JSZip();

  // Adicionar um README no ZIP
  const backupDateStr = new Date().toLocaleString('pt-BR');
  zip.file(
    'LEIA-ME.txt',
    `============================================================
BKP - EVOLUÇÃO CLÍNICA
Exportação efetuada em: ${backupDateStr}
============================================================

Este backup contém todo o histórico dos seus prontuários estruturado
em diretórios para cada paciente ativo.

A estrutura do backup é organizada da seguinte forma:
- [Nome do Paciente]/
  - Dados_Cadastrais.txt (Dados de cadastro do paciente)
  - Prontuario_Completo.md (Consolidado de todas as evoluções clínicas)
  - Relatorios_e_PDIs/ (Documentos de relatórios ou PDIs gerados por IA)
`
  );

  // 5. Agrupar dados por paciente
  for (const patient of patients) {
    const cleanPatientName = patient.full_name.trim().replace(/[\/\\?%*:|"<>\s]+/g, '_');
    const patientFolder = zip.folder(cleanPatientName);

    if (!patientFolder) continue;

    // A. Dados Cadastrais
    const birthDateFormatted = patient.birth_date ? formatBackupDate(patient.birth_date) : 'Não informado';
    const patientDataText = `DADOS CADASTRAIS DO PACIENTE

Nome Completo: ${patient.full_name}
CPF/Documento: ${patient.document_number || 'Não informado'}
Data de Nascimento: ${birthDateFormatted}
Telefone: ${patient.phone || 'Não informado'}
Lembrete de Sessão: ${patient.session_reminder || 'Não configurado'}
Notas Rápidas: ${patient.quick_notes || 'Nenhuma nota registrada'}

Exportado de Evolução Clínica em ${backupDateStr}
`;
    patientFolder.file('Dados_Cadastrais.txt', patientDataText);

    // B. Prontuário Completo (Evoluções)
    const patientEvos = (evolutions || []).filter((e) => e.patient_id === patient.id);
    let mdContent = `# Prontuário Clínico Consolidado\n\n`;
    mdContent += `**Paciente:** ${patient.full_name}\n`;
    mdContent += `**Nascimento:** ${birthDateFormatted}\n`;
    mdContent += `**Documento:** ${patient.document_number || 'Não informado'}\n`;
    mdContent += `**Total de Sessões:** ${patientEvos.length}\n\n`;
    mdContent += `---\n\n`;

    if (patientEvos.length === 0) {
      mdContent += `*Nenhuma evolução registrada para este paciente.*\n`;
    } else {
      for (const evo of patientEvos) {
        const sessionDateFmt = formatBackupDate(evo.session_date);
        const regDateTime = new Date(evo.created_at).toLocaleString('pt-BR');
        const statusLabel = evo.status === 'signed' ? '🔒 Assinado Digitalmente' : '📝 Rascunho';

        mdContent += `### Sessão: ${sessionDateFmt} às ${evo.session_time || 'N/A'}\n`;
        mdContent += `- **Registro no Sistema:** ${regDateTime}\n`;
        mdContent += `- **Status do Documento:** ${statusLabel}\n`;

        if (evo.status === 'signed') {
          const sigDateFmt = new Date(evo.signature_date).toLocaleString('pt-BR');
          mdContent += `- **Assinatura Digital:** Registrada via IP ${evo.signature_ip} em ${sigDateFmt} (${evo.signature_method})\n`;
        }

        mdContent += `\n**Evolução Clínica:**\n\n`;
        mdContent += `${evo.content}\n\n`;
        mdContent += `* * *\n\n`;
      }
    }

    patientFolder.file('Prontuario_Completo.md', mdContent);

    // C. Relatórios e PDIs
    const patientReports = (reports || []).filter((r) => r.patient_id === patient.id);
    if (patientReports.length > 0) {
      const reportsFolder = patientFolder.folder('Relatorios_e_PDIs');
      if (reportsFolder) {
        for (const rep of patientReports) {
          const repDateFmt = formatBackupDate(rep.created_at).replace(/:/g, '-');
          const typeLabel = rep.type === 'evolution_report' ? 'Relatorio_Evolucao' : 'PDI_Rascunho';
          const fileName = `${typeLabel}_${repDateFmt}.md`;

          let repMd = `# ${rep.type === 'evolution_report' ? 'Relatório de Evolução Clínica' : 'Plano de Desenvolvimento Individual (PDI)'}\n\n`;
          repMd += `**Paciente:** ${patient.full_name}\n`;
          repMd += `**Período Analisado:** ${rep.period_label}\n`;
          repMd += `**Data de Criação:** ${new Date(rep.created_at).toLocaleString('pt-BR')}\n`;
          if (rep.google_doc_url) {
            repMd += `**Documento de Origem:** [Acessar Google Docs](${rep.google_doc_url})\n`;
          }
          repMd += `\n---\n\n`;
          repMd += `${rep.content}\n`;

          reportsFolder.file(fileName, repMd);
        }
      }
    }
  }

  // 6. Gerar o ZIP
  return await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
}

/**
 * Executa o download direto do ZIP no navegador do usuário
 */
export async function downloadBackupZip(userId: string, professionalName: string): Promise<void> {
  const blob = await generateBackupZip(userId);
  const dateStr = new Date().toISOString().split('T')[0];
  const cleanName = professionalName.trim().replace(/[\/\\?%*:|"<>\s]+/g, '_');
  const filename = `Backup_Evolucao_Clinica_${cleanName}_${dateStr}.zip`;

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
 * Envia o backup compactado (ZIP) diretamente para a conta Google Drive do profissional
 */
export async function uploadBackupToGoogleDrive(
  googleAccessToken: string,
  zipBlob: Blob,
  professionalName: string
): Promise<any> {
  // 1. Procurar ou Criar pasta raiz "Evolução Clínica - Backups"
  const folderName = 'Evolução Clínica - Backups';
  const query = `name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const files = await listGoogleFiles(googleAccessToken, 'root', folderName, true);
  
  let targetFolderId = '';
  // Filtro exato
  const exactFolder = files.find((f: any) => f.name === folderName);
  
  if (exactFolder) {
    targetFolderId = exactFolder.id;
  } else {
    const newFolder = await createGoogleFolder(googleAccessToken, folderName);
    targetFolderId = newFolder.id;
  }

  // 2. Definir nome do arquivo ZIP
  const dateStr = new Date().toISOString().split('T')[0];
  const cleanName = professionalName.trim().replace(/[\/\\?%*:|"<>\s]+/g, '_');
  const filename = `Backup_Evolucao_Clinica_${cleanName}_${dateStr}.zip`;

  // 3. Fazer upload do ZIP
  return await uploadZipToGoogleDrive(googleAccessToken, zipBlob, filename, targetFolderId);
}

/**
 * Função gatilho executada em background para realizar o backup periódico de 30 dias
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

    // Verificar se já passou o tempo necessário (30 dias = 2592000000ms)
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const lastBackupTime = prefs.lastBackupAt ? new Date(prefs.lastBackupAt).getTime() : 0;

    if (now - lastBackupTime >= THIRTY_DAYS_MS) {
      console.log('[BackupService] Disparando backup automático mensal para o Google Drive...');
      const zipBlob = await generateBackupZip(userId);
      await uploadBackupToGoogleDrive(googleAccessToken, zipBlob, professionalName);
      await updateLastBackupTimestamp(userId);
      console.log('[BackupService] Backup automático mensal concluído e salvo no Drive!');
    }
  } catch (err) {
    console.error('[BackupService] Erro ao executar backup automático mensal:', err);
  }
}
