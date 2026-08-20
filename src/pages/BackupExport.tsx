import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, AlertTriangle, ArrowRight, CheckCircle, Cloud, Database, Download, Loader2, Lock, RefreshCcw, Shield, ShieldAlert } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/authStore';
import { showAlert, showConfirm } from '../store/modalStore';
import {
  downloadBackupJsonLocal,
  generateBackupJson,
  getBackupsListFromDrive,
  restoreBackupFromDrive,
  updateBackupPreferences,
  uploadBackupToGoogleDrive
} from '../services/backupService';
import { hasActiveYearlyAccess } from '../utils/subscriptionAccess';

interface DriveBackup {
  id: string;
  name: string;
  size?: string;
}

const formatBackupName = (name: string, snapshot = false) => {
  const match = name.match(/Backup_.*_(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})/);
  if (!match) return name;
  const [, datePart, hour, minute, second] = match;
  const [year, month, day] = datePart.split('-');
  return `${snapshot ? 'Snapshot' : 'Backup'} do dia ${day}/${month}/${year} às ${hour}:${minute}:${second}`;
};

export default function BackupExport() {
  const navigate = useNavigate();
  const { user, googleAccessToken, profileRole, subscriptionPlan, subscriptionStatus, subscriptionEndsAt } = useAuthStore();
  const [professionalName, setProfessionalName] = useState('Terapeuta');
  const [dbSubscriptionPlan, setDbSubscriptionPlan] = useState<'trial' | 'monthly' | 'yearly' | 'courtesy' | 'none' | null>(null);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
  const [backupFrequency, setBackupFrequency] = useState<'daily' | 'weekly' | 'monthly'>('monthly');
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [backupsList, setBackupsList] = useState<DriveBackup[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingBackupsList, setLoadingBackupsList] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [uploadingBackupDrive, setUploadingBackupDrive] = useState(false);
  const [restoringBackupId, setRestoringBackupId] = useState<string | null>(null);
  const [backupToRestore, setBackupToRestore] = useState<DriveBackup | null>(null);
  const [successMessage, setSuccessMessage] = useState('');

  const isYearly = hasActiveYearlyAccess({
    profileRole,
    subscriptionPlan: dbSubscriptionPlan ?? subscriptionPlan,
    subscriptionStatus,
    subscriptionEndsAt
  });

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    window.setTimeout(() => setSuccessMessage(''), 4000);
  };

  const loadGoogleBackups = useCallback(async () => {
    if (!googleAccessToken || !isYearly) return;
    try {
      setLoadingBackupsList(true);
      const list = await getBackupsListFromDrive(googleAccessToken);
      setBackupsList(list);
    } catch (error) {
      console.error('[BackupExport] Erro ao carregar backups do Drive:', error);
    } finally {
      setLoadingBackupsList(false);
    }
  }, [googleAccessToken, isYearly]);

  useEffect(() => {
    const loadBackupSettings = async () => {
      if (!user) return;
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('professionals')
          .select('full_name, subscription_plan, auto_backup_enabled, backup_frequency, last_backup_at')
          .eq('id', user.id)
          .single();

        if (error) throw error;
        setProfessionalName(data?.full_name || user.user_metadata?.full_name || 'Terapeuta');
        setDbSubscriptionPlan(data?.subscription_plan || null);
        setAutoBackupEnabled(data?.auto_backup_enabled || false);
        setBackupFrequency((data?.backup_frequency as 'daily' | 'weekly' | 'monthly') || 'monthly');
        setLastBackupAt(data?.last_backup_at || null);
      } catch (error) {
        console.error('[BackupExport] Erro ao carregar configurações:', error);
        setProfessionalName(user.user_metadata?.full_name || 'Terapeuta');
      } finally {
        setLoading(false);
      }
    };

    void loadBackupSettings();
  }, [user]);

  useEffect(() => {
    if (googleAccessToken && isYearly) void loadGoogleBackups();
  }, [googleAccessToken, isYearly, loadGoogleBackups]);

  const handleManualBackup = async () => {
    if (!user) return;
    const confirmed = await showConfirm('Deseja gerar e baixar um arquivo de backup completo contendo os seus dados cadastrais, fichas de pacientes e prontuários?', {
      title: 'Confirmar Backup',
      confirmLabel: 'Gerar Backup',
      cancelLabel: 'Cancelar',
      variant: 'info',
      icon: 'question'
    });
    if (!confirmed) return;

    try {
      setBackingUp(true);
      await downloadBackupJsonLocal(user.id, professionalName);
      showSuccess('Backup completo baixado com sucesso!');
    } catch (error: any) {
      console.error('[BackupExport] Erro ao gerar backup:', error);
      await showAlert(`Erro ao gerar backup: ${error.message || error}`, { title: 'Erro de Backup', variant: 'danger', icon: 'warning' });
    } finally {
      setBackingUp(false);
    }
  };

  const handleToggleAutoBackup = async () => {
    if (!user) return;
    try {
      const enabled = !autoBackupEnabled;
      await updateBackupPreferences(user.id, enabled, backupFrequency);
      setAutoBackupEnabled(enabled);
      showSuccess(enabled ? 'Backup automático ativado!' : 'Backup automático desativado!');
    } catch (error: any) {
      console.error('[BackupExport] Erro ao atualizar backup automático:', error);
      await showAlert(`Erro ao salvar preferência de backup: ${error.message || error}`, { title: 'Erro ao Salvar', variant: 'danger', icon: 'warning' });
    }
  };

  const handleChangeBackupFrequency = async (frequency: 'daily' | 'weekly' | 'monthly') => {
    if (!user) return;
    try {
      await updateBackupPreferences(user.id, autoBackupEnabled, frequency);
      setBackupFrequency(frequency);
      const frequencyLabel = frequency === 'daily' ? 'Diário' : frequency === 'weekly' ? 'Semanal' : 'Mensal';
      showSuccess(`Frequência de backup alterada para: ${frequencyLabel}`);
    } catch (error: any) {
      console.error('[BackupExport] Erro ao alterar frequência:', error);
      await showAlert(`Erro ao salvar frequência: ${error.message || error}`, { title: 'Erro ao Salvar', variant: 'danger', icon: 'warning' });
    }
  };

  const handleManualDriveBackup = async () => {
    if (!user || !googleAccessToken) return;
    const confirmed = await showConfirm('Deseja gerar e enviar uma cópia de segurança completa para a sua conta do Google Drive agora?', {
      title: 'Backup no Google Drive',
      confirmLabel: 'Gerar Backup',
      cancelLabel: 'Cancelar',
      variant: 'info',
      icon: 'question'
    });
    if (!confirmed) return;

    try {
      setUploadingBackupDrive(true);
      const jsonString = await generateBackupJson(user.id);
      await uploadBackupToGoogleDrive(googleAccessToken, jsonString, professionalName);
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('professionals')
        .update({ last_backup_at: now, updated_at: now })
        .eq('id', user.id);
      if (error) throw error;
      setLastBackupAt(now);
      showSuccess('Cópia de segurança salva com sucesso no seu Google Drive!');
      await loadGoogleBackups();
    } catch (error: any) {
      console.error('[BackupExport] Erro ao enviar backup para o Drive:', error);
      await showAlert(`Erro ao enviar backup para o Drive: ${error.message || error}`, { title: 'Erro no Backup', variant: 'danger', icon: 'warning' });
    } finally {
      setUploadingBackupDrive(false);
    }
  };

  const handleRestoreBackup = async (backup: DriveBackup) => {
    if (!user || !googleAccessToken) return;
    try {
      setRestoringBackupId(backup.id);
      const result = await restoreBackupFromDrive(googleAccessToken, backup.id, user.id);
      await showAlert(`Restauração concluída com sucesso!\n\nDados importados/atualizados:\n- ${result.patientsCount} Pacientes\n- ${result.evolutionsCount} Evoluções Clínicas\n- ${result.reportsCount} Relatórios/PDIs`, {
        title: 'Restauração Concluída',
        variant: 'success',
        icon: 'success'
      });
      showSuccess('Dados restaurados com sucesso!');
    } catch (error: any) {
      console.error('[BackupExport] Erro ao restaurar backup:', error);
      await showAlert(`Erro na restauração: ${error.message || error}`, { title: 'Erro de Restauração', variant: 'danger', icon: 'warning' });
    } finally {
      setRestoringBackupId(null);
      setBackupToRestore(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
        <span className="ml-2 text-sm text-brand-text-muted">Carregando configurações de backup...</span>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 pb-12">
      <div>
        <div>
          <h1 className="flex items-center text-3xl font-display font-bold text-brand-text"><Cloud className="mr-3 shrink-0 text-brand-primary" size={32} /><span>Backup e Exportação de Dados</span></h1>
          <p className="mt-1 text-sm text-brand-text-muted">Proteja, exporte e restaure os dados da sua conta.</p>
        </div>
      </div>

      {successMessage && (
        <div className="flex items-center space-x-2 rounded-xl border border-emerald-100 bg-emerald-50 p-3.5 text-sm text-emerald-700 animate-fadeIn">
          <CheckCircle className="h-5 w-5 flex-shrink-0 text-emerald-600" />
          <span className="font-medium">{successMessage}</span>
        </div>
      )}

      {!isYearly ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <section className="card space-y-6 rounded-3xl border border-brand-border bg-white p-8 lg:col-span-3">
            <h2 className="flex items-center gap-2 text-xl font-bold text-brand-text"><Shield className="text-brand-primary" size={24} /><span>Como funciona o Backup de Dados?</span></h2>
            <div className="space-y-4">
              {[
                ['1', 'Você protege todos os seus dados', 'As configurações, pacientes, evoluções e relatórios são reunidos em uma cópia de segurança.'],
                ['2', 'Escolhe onde e quando salvar', 'Exporte localmente ou use o Google Drive para criar backups manuais e automáticos.'],
                ['3', 'Restaura quando precisar', 'Recupere versões anteriores diretamente pela plataforma, com histórico das 3 cópias mais recentes.']
              ].map(([number, title, description]) => (
                <div key={number} className="flex items-start space-x-3"><div className="mt-0.5 rounded-lg bg-brand-bg p-2 font-bold text-brand-primary">{number}</div><div><h3 className="text-sm font-semibold text-brand-text">{title}</h3><p className="mt-0.5 text-xs text-brand-text-muted">{description}</p></div></div>
              ))}
            </div>
            <div className="border-t border-brand-border/60 pt-4"><div className="flex items-start gap-3 rounded-2xl bg-sky-50 p-4 text-xs text-sky-800"><Shield className="mt-0.5 shrink-0 text-sky-600" size={16} /><div><span className="mb-0.5 block font-bold">Segurança e autonomia:</span>Você mantém uma cópia organizada dos dados clínicos para continuar o trabalho com tranquilidade.</div></div></div>
          </section>

          <aside className="card relative flex flex-col justify-between overflow-hidden rounded-3xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-white p-8 text-center shadow-sm lg:col-span-2">
            <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-full bg-gradient-to-br from-amber-400/15 to-transparent blur-3xl" />
            <div className="relative z-10 space-y-6"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/20"><Lock size={32} /></div><div className="space-y-2"><h2 className="text-lg font-bold text-amber-950">Disponível no Plano Anual</h2><p className="text-xs leading-relaxed text-amber-800/80">Mantenha cópias completas dos seus dados e restaure quando precisar.</p></div><div className="space-y-2.5 rounded-2xl border border-amber-200/50 bg-amber-50 p-4 text-left">{['Backup completo no Google Drive', 'Restauração em poucos cliques', 'Histórico das 3 últimas versões'].map((benefit) => <div key={benefit} className="flex items-center gap-2 text-xs font-semibold text-amber-900"><CheckCircle size={14} className="shrink-0 text-amber-600" />{benefit}</div>)}</div></div>
            <div className="relative z-10 pt-8"><button type="button" onClick={() => navigate('/painel/subscription')} className="flex w-full cursor-pointer items-center justify-center space-x-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-3.5 font-bold text-white shadow-md shadow-orange-500/10 transition-all hover:from-amber-600 hover:to-orange-600"><span>Fazer Upgrade Agora</span><ArrowRight size={16} /></button><p className="mt-2 text-[10px] text-amber-800/60">Mude para o Plano Anual e economize 57% em relação a 12 mensalidades</p></div>
          </aside>
        </div>
      ) : (
        <div className="card space-y-6 border border-brand-border/60 bg-white p-5 shadow-sm md:p-8">
          <p className="text-xs leading-relaxed text-brand-text-muted">
            Sua conta possui o sistema de backup seguro e soberania dos dados. Toda a sua configuração de conta, lista de pacientes, evoluções clínicas assinadas e relatórios de IA são compilados em um arquivo de segurança. Você pode restaurar qualquer backup anterior diretamente do seu Google Drive.
          </p>

          <div className="flex flex-col gap-5 md:flex-row">
            <div className="flex-1 space-y-5 rounded-2xl border border-brand-border/60 bg-brand-bg/10 p-5">
              <div className="space-y-1.5 border-b border-brand-border/40 pb-3">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold text-brand-primary"><Cloud size={16} className="text-brand-primary/80" /> Sincronização no Google Drive</h2>
                <p className="text-xs leading-relaxed text-brand-text-muted">Configure e controle os snapshots automáticos na sua conta pessoal.</p>
              </div>

              <div className="flex items-center justify-between">
                <div><span className="block text-xs font-semibold text-brand-primary">Backup Automático</span><span className="block text-[10px] text-brand-text-muted">Gera cópias periódicas na nuvem</span></div>
                <button type="button" onClick={handleToggleAutoBackup} className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${autoBackupEnabled ? 'bg-brand-primary' : 'bg-stone-200'}`} aria-pressed={autoBackupEnabled} aria-label="Ativar ou desativar backup automático">
                  <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${autoBackupEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-brand-primary">Frequência da Automação</label>
                <select value={backupFrequency} onChange={(event) => handleChangeBackupFrequency(event.target.value as 'daily' | 'weekly' | 'monthly')} disabled={!autoBackupEnabled} className="w-full cursor-pointer rounded-xl border border-brand-border bg-white px-3 py-2 text-xs font-medium text-brand-text focus:outline-none focus:ring-1 focus:ring-brand-primary/30 disabled:bg-stone-50 disabled:opacity-50">
                  <option value="daily">Diário (a cada 24 horas)</option><option value="weekly">Semanal (a cada 7 dias)</option><option value="monthly">Mensal (a cada 30 dias)</option>
                </select>
              </div>

              <div className="space-y-2 pt-2">
                <button type="button" onClick={handleManualDriveBackup} disabled={uploadingBackupDrive || !googleAccessToken} className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-brand-primary/10 transition-colors hover:bg-brand-primary/95 disabled:cursor-not-allowed disabled:opacity-50">
                  {uploadingBackupDrive ? <><Loader2 size={14} className="animate-spin" /> Enviando para o Drive...</> : <><Cloud size={14} /> Salvar no Drive Agora</>}
                </button>
                <button type="button" onClick={handleManualBackup} disabled={backingUp} className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-brand-primary/20 bg-white px-4 py-2.5 text-xs font-semibold text-brand-primary transition-colors hover:bg-brand-primary/5 disabled:cursor-not-allowed disabled:opacity-50">
                  {backingUp ? <><Loader2 size={14} className="animate-spin" /> Exportando backup...</> : <><Download size={14} /> Baixar Backup Local</>}
                </button>
              </div>

              {!googleAccessToken && <p className="text-[10px] leading-relaxed text-amber-700">Conecte novamente sua conta Google para salvar e restaurar backups no Drive.</p>}
              <div className="flex justify-between border-t border-brand-border/40 pt-2 text-[10px] text-brand-text-muted"><span>Último backup realizado:</span><span className="font-semibold text-brand-primary">{lastBackupAt ? new Date(lastBackupAt).toLocaleString('pt-BR') : 'Nunca realizado'}</span></div>
            </div>

            <div className="flex flex-1 flex-col justify-between space-y-4 rounded-2xl border border-brand-border/60 bg-brand-bg/10 p-5">
              <div className="flex items-center justify-between space-y-1.5 border-b border-brand-border/40 pb-3">
                <div><h2 className="flex items-center gap-1.5 text-sm font-semibold text-brand-primary"><Database size={16} className="text-brand-primary/80" /> Versões Anteriores (Drive)</h2><p className="text-xs leading-relaxed text-brand-text-muted">Restaurar dados salvos. Mantemos as 3 versões mais recentes.</p></div>
                {googleAccessToken && <button type="button" onClick={loadGoogleBackups} disabled={loadingBackupsList} className="cursor-pointer rounded-lg p-1.5 text-brand-primary transition-colors hover:bg-brand-primary/5" title="Atualizar lista de backups"><RefreshCcw size={14} className={loadingBackupsList ? 'animate-spin' : ''} /></button>}
              </div>

              <div className="flex flex-1 flex-col justify-center">
                {!googleAccessToken ? (
                  <div className="space-y-2 rounded-2xl border border-dashed border-stone-300 bg-white/50 px-4 py-6 text-center"><ShieldAlert size={24} className="mx-auto text-stone-400" /><h3 className="text-xs font-semibold text-brand-primary">Google Drive Desconectado</h3><p className="mx-auto max-w-[220px] text-[10px] leading-relaxed text-brand-text-muted">Conecte sua conta do Google novamente para gerenciar os arquivos de backup.</p></div>
                ) : loadingBackupsList ? (
                  <div className="py-10 text-center"><Loader2 size={24} className="mx-auto mb-2 animate-spin text-brand-primary" /><span className="text-xs font-medium text-brand-text-muted">Buscando backups no seu Drive...</span></div>
                ) : backupsList.length === 0 ? (
                  <div className="space-y-1 rounded-2xl border border-dashed border-stone-200 bg-white/50 px-4 py-8 text-center"><Database size={22} className="mx-auto mb-1 text-stone-400" /><h3 className="text-xs font-semibold text-brand-primary">Nenhum backup encontrado</h3><p className="text-[10px] leading-relaxed text-brand-text-muted">Realize o primeiro backup no Drive para exibir a lista de restauração.</p></div>
                ) : (
                  <div className="space-y-2.5">
                    {backupsList.slice(0, 3).map((backup, index) => {
                      const size = backup.size ? `${(Number.parseInt(backup.size, 10) / 1024).toFixed(1)} KB` : 'Tamanho desconhecido';
                      return (
                        <div key={backup.id} className="flex items-center justify-between gap-3 rounded-xl border border-brand-border/60 bg-white p-3 shadow-sm">
                          <div className="min-w-0 space-y-0.5"><span className="block truncate text-xs font-semibold text-brand-primary" title={backup.name}>{formatBackupName(backup.name)}</span><div className="flex items-center gap-2 text-[10px] text-brand-text-muted"><span>Versão {index === 0 ? 'mais recente' : `${index + 1}ª anterior`}</span><span>•</span><span>{size}</span></div></div>
                          <button type="button" onClick={() => setBackupToRestore(backup)} disabled={restoringBackupId !== null} className="btn-outline flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-lg border-brand-primary/20 px-2.5 text-[10px] font-semibold text-brand-primary hover:bg-brand-primary/5 disabled:cursor-not-allowed disabled:opacity-60">
                            {restoringBackupId === backup.id ? <><Loader2 size={10} className="animate-spin" /> Restaurando...</> : <><RefreshCcw size={10} /> Restaurar</>}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {backupToRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-brand-border bg-white shadow-2xl">
            <div className="bg-gradient-to-r from-brand-primary to-brand-accent px-6 py-5 text-white"><div className="flex items-center gap-3"><div className="rounded-2xl bg-white/15 p-2.5"><AlertTriangle className="h-5 w-5" /></div><div><h2 className="text-lg font-bold text-white">Restaurar Prontuários</h2><p className="text-xs text-white/80">Confirmação de Importação de Backup</p></div></div></div>
            <div className="space-y-4 p-6">
              <p className="text-xs leading-relaxed text-brand-text">Você está prestes a restaurar os prontuários a partir do arquivo selecionado:</p>
              <div className="rounded-2xl border border-brand-border/60 bg-brand-bg/50 p-3 text-xs font-medium text-brand-primary">{formatBackupName(backupToRestore.name, true)}</div>
              <div className="space-y-2 rounded-2xl border border-amber-100 bg-amber-50/70 p-4 text-xs leading-relaxed text-amber-800"><p className="flex items-center gap-1 font-semibold"><AlertCircle size={14} className="text-amber-600" /> Informações Importantes:</p><ul className="list-disc space-y-1 pl-4"><li>A restauração é inteligente: ela <strong>mescla</strong> os dados do backup. Pacientes ou evoluções novas cadastradas após este backup <strong>não serão excluídos</strong>.</li><li>Os registros clínicos correspondentes que já existem serão atualizados para o estado em que estavam no backup.</li></ul></div>
              <p className="text-[10px] text-brand-text-muted">Esta operação é segura e utiliza atualizações idempotentes por UUID. Deseja prosseguir com a restauração?</p>
              <div className="flex justify-end gap-3 border-t border-brand-border/40 pt-2"><button type="button" onClick={() => setBackupToRestore(null)} className="cursor-pointer rounded-xl border border-brand-border px-4 py-2.5 text-xs font-semibold text-brand-text transition-colors hover:bg-stone-50">Cancelar</button><button type="button" onClick={() => handleRestoreBackup(backupToRestore)} className="cursor-pointer rounded-xl bg-brand-primary px-5 py-2.5 text-xs font-semibold text-white shadow-md shadow-brand-primary/10 transition-colors hover:bg-brand-primary/95">Confirmar e Restaurar</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
