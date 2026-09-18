import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ExternalLink,
  FolderOpen,
  Loader2,
  Paperclip,
  Pencil,
  RefreshCw,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { deleteGoogleFile, uploadFileToGoogleDrive } from '../../services/googleDocs';
import {
  createPatientFile,
  deletePatientFileRecord,
  listPatientFiles,
  updatePatientFileType,
  type PatientFileRecord,
} from '../../services/patientFiles';
import {
  PATIENT_FILE_TYPES,
  getPatientFileType,
  getPatientFileTypeLabel,
  type PatientFileTypeKey,
} from '../../utils/patientFileTypes';
import {
  GOOGLE_SCOPE_SETS,
  getCurrentGoogleOAuthRedirectUrl,
  hasGoogleScopes,
  requestGoogleOAuth,
} from '../../services/googleAuth';
import { isGoogleAccessTokenFresh } from '../../utils/googleAuthSession';
import { showAlert, showConfirm } from '../../store/modalStore';

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt'];
const ACCEPT_ATTRIBUTE = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt';

type PendingUpload = {
  id: string;
  file: File;
  fileTypeKey: PatientFileTypeKey | '';
  customTypeLabel: string;
  status: 'pending' | 'uploading' | 'error';
  error?: string;
};

type PatientFilesCardProps = {
  patientId: string;
  targetFolderId?: string | null;
  targetFolderName?: string | null;
  editPatientHref: string;
};

const isGoogleAuthError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || '');
  return /UNAUTHENTICATED|invalid authentication credentials|INSUFFICIENT_SCOPES|insufficient permissions|\b401\b/i.test(message);
};

const isGoogleFileMissingError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || '');
  return /\b404\b|not found|File not found/i.test(message);
};

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'Tamanho não informado';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

const getExtension = (name: string) => {
  const extension = name.split('.').pop()?.trim().toLowerCase() || '';
  return extension && extension !== name.toLowerCase() ? extension : '';
};

const isAcceptedFile = (file: File) => ACCEPTED_EXTENSIONS.includes(getExtension(file.name));

type TypeDropdownProps = {
  value: PatientFileTypeKey | '';
  open: boolean;
  onToggle: () => void;
  onSelect: (value: PatientFileTypeKey) => void;
  disabled?: boolean;
};

function TypeDropdown({ value, open, onToggle, onSelect, disabled }: TypeDropdownProps) {
  const selected = value ? getPatientFileType(value) : null;
  const SelectedIcon = selected?.icon;

  return (
    <div className={`relative ${open ? 'z-[70]' : 'z-0'}`}>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-brand-border bg-white px-3 py-2.5 text-left text-xs font-semibold text-brand-text outline-none transition-colors hover:border-brand-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="flex min-w-0 items-center gap-2">
          {SelectedIcon ? <SelectedIcon size={15} className="shrink-0 text-brand-primary" /> : <Paperclip size={15} className="shrink-0 text-brand-text-muted" />}
          <span className="truncate">{selected?.label || 'Selecionar tipo do arquivo'}</span>
        </span>
        <ChevronDown size={15} className={`shrink-0 text-brand-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && !disabled && (
        <div className="absolute z-[80] mt-1 max-h-72 w-full min-w-[240px] overflow-y-auto rounded-xl border border-brand-border bg-white p-1.5 shadow-xl">
          {PATIENT_FILE_TYPES.map((option) => {
            const Icon = option.icon;
            const active = value === option.key;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => onSelect(option.key)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs transition-colors ${
                  active
                    ? 'bg-brand-primary/10 font-semibold text-brand-primary'
                    : 'text-brand-text hover:bg-brand-bg'
                }`}
              >
                <Icon size={15} className="shrink-0" />
                <span className="flex-1">{option.label}</span>
                {active && <Check size={14} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function PatientFilesCard({
  patientId,
  targetFolderId,
  targetFolderName,
  editPatientHref,
}: PatientFilesCardProps) {
  const {
    user,
    googleAccessToken,
    googleAccessTokenIssuedAt,
    googleGrantedScopes,
    setGoogleAccessToken,
  } = useAuthStore();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<PatientFileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [openTypeMenuId, setOpenTypeMenuId] = useState<string | null>(null);
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editTypeKey, setEditTypeKey] = useState<PatientFileTypeKey | ''>('');
  const [editTypeLabel, setEditTypeLabel] = useState('');
  const [savingType, setSavingType] = useState(false);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const hasClinicalAccess = Boolean(googleAccessToken)
    && hasGoogleScopes(googleGrantedScopes, GOOGLE_SCOPE_SETS.clinicalDocs);
  const hasFreshClinicalAccess = hasClinicalAccess
    && isGoogleAccessTokenFresh(googleAccessToken, googleAccessTokenIssuedAt);

  const canUpload = Boolean(targetFolderId) && hasFreshClinicalAccess;

  const loadFiles = async () => {
    setLoading(true);
    try {
      setFiles(await listPatientFiles(patientId));
    } catch (error) {
      console.error('[PatientFiles] Erro ao carregar arquivos:', error);
      await showAlert('Não foi possível carregar os arquivos deste paciente.', {
        title: 'Arquivos indisponíveis',
        variant: 'danger',
        icon: 'warning',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadFiles();
  }, [patientId]);

  const startGoogleAuthorization = async () => {
    if (authLoading) return;
    setAuthLoading(true);
    try {
      const { error } = await requestGoogleOAuth({
        requiredScopes: 'clinicalDocs',
        currentGrantedScopes: googleGrantedScopes,
        redirectTo: getCurrentGoogleOAuthRedirectUrl(),
        loginHint: user?.email || undefined,
      });
      if (error) throw error;
    } catch (error: any) {
      console.error('[PatientFiles] Erro ao renovar Google:', error);
      await showAlert(error?.message || 'Não foi possível conectar ao Google Drive.', {
        title: 'Conexão com o Google',
        variant: 'danger',
        icon: 'warning',
      });
    } finally {
      setAuthLoading(false);
    }
  };

  const appendSelectedFiles = async (selected: File[]) => {
    if (!targetFolderId) {
      await showAlert('Vincule uma pasta do Google Drive ao paciente antes de adicionar arquivos.', {
        title: 'Pasta necessária',
        variant: 'warning',
        icon: 'warning',
      });
      return;
    }

    if (!hasFreshClinicalAccess) {
      await showAlert('Conecte novamente sua conta Google antes de selecionar arquivos para este paciente.', {
        title: 'Conexão com o Google necessária',
        variant: 'warning',
        icon: 'warning',
      });
      return;
    }

    const accepted: PendingUpload[] = [];
    const rejected: string[] = [];

    selected.forEach((file, index) => {
      if (!isAcceptedFile(file)) {
        rejected.push(`${file.name}: formato não suportado`);
        return;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        rejected.push(`${file.name}: excede 25 MB`);
        return;
      }

      accepted.push({
        id: `${Date.now()}-${index}-${file.name}`,
        file,
        fileTypeKey: '',
        customTypeLabel: '',
        status: 'pending',
      });
    });

    if (accepted.length > 0) {
      setPending((current) => [...current, ...accepted]);
    }

    if (rejected.length > 0) {
      await showAlert(
        `Alguns arquivos não foram adicionados:\n\n${rejected.join('\n')}`,
        {
          title: 'Arquivos não aceitos',
          variant: 'warning',
          icon: 'warning',
        }
      );
    }
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []);
    event.target.value = '';
    if (selected.length > 0) void appendSelectedFiles(selected);
  };

  const validatePendingFile = (item: PendingUpload) => {
    if (!item.fileTypeKey) return 'Selecione o tipo do arquivo.';
    if (item.fileTypeKey === 'other' && !item.customTypeLabel.trim()) {
      return 'Digite o nome do tipo para arquivos classificados como “Outro”.';
    }
    return '';
  };

  const handleUploadAll = async () => {
    if (!targetFolderId || !googleAccessToken || uploading) return;

    const firstInvalid = pending.find((item) => validatePendingFile(item));
    if (firstInvalid) {
      await showAlert(validatePendingFile(firstInvalid), {
        title: 'Revise os arquivos',
        variant: 'warning',
        icon: 'warning',
      });
      return;
    }

    setUploading(true);
    for (const item of [...pending]) {
      setPending((current) => current.map((entry) => (
        entry.id === item.id ? { ...entry, status: 'uploading', error: undefined } : entry
      )));

      let uploadedDriveId = '';
      try {
        const uploaded = await uploadFileToGoogleDrive(
          googleAccessToken,
          item.file,
          item.file.name,
          targetFolderId
        );
        uploadedDriveId = uploaded.id;

        const fileTypeKey = item.fileTypeKey as PatientFileTypeKey;
        const fileTypeLabel = fileTypeKey === 'other'
          ? item.customTypeLabel.trim()
          : getPatientFileTypeLabel(fileTypeKey);

        const created = await createPatientFile({
          patientId,
          googleDriveFileId: uploaded.id,
          googleDriveWebViewLink: uploaded.webViewLink,
          originalFileName: item.file.name,
          mimeType: uploaded.mimeType || item.file.type || 'application/octet-stream',
          sizeBytes: uploaded.size || item.file.size,
          fileTypeKey,
          fileTypeLabel,
        });

        setFiles((current) => [created, ...current]);
        setPending((current) => current.filter((entry) => entry.id !== item.id));
      } catch (error: any) {
        console.error('[PatientFiles] Erro no upload:', error);

        if (uploadedDriveId) {
          try {
            await deleteGoogleFile(googleAccessToken, uploadedDriveId);
          } catch (rollbackError) {
            console.error('[PatientFiles] Não foi possível remover arquivo após falha de catálogo:', rollbackError);
          }
        }

        const authenticationExpired = isGoogleAuthError(error);
        if (authenticationExpired) {
          setGoogleAccessToken(null);
        }

        setPending((current) => current.map((entry) => (
          entry.id === item.id
            ? { ...entry, status: 'error', error: authenticationExpired ? 'A conexão com o Google expirou. Reconecte e tente novamente.' : (error?.message || 'Falha no envio.') }
            : authenticationExpired && entry.status === 'pending'
              ? { ...entry, status: 'error', error: 'Reconecte o Google antes de continuar os envios.' }
              : entry
        )));

        if (authenticationExpired) break;
      }
    }
    setUploading(false);
  };

  const beginEditType = (file: PatientFileRecord) => {
    setEditingFileId(file.id);
    setEditTypeKey(file.fileTypeKey);
    setEditTypeLabel(file.fileTypeKey === 'other' ? file.fileTypeLabel : '');
    setOpenTypeMenuId(null);
  };

  const saveEditedType = async (file: PatientFileRecord) => {
    if (!editTypeKey || savingType) return;
    const label = editTypeKey === 'other'
      ? editTypeLabel.trim()
      : getPatientFileTypeLabel(editTypeKey);

    if (!label) {
      await showAlert('Digite o nome do tipo do arquivo.', {
        title: 'Tipo do arquivo',
        variant: 'warning',
        icon: 'warning',
      });
      return;
    }

    setSavingType(true);
    try {
      const updated = await updatePatientFileType(file.id, editTypeKey, label);
      setFiles((current) => current.map((item) => item.id === file.id ? updated : item));
      setEditingFileId(null);
      setOpenTypeMenuId(null);
    } catch (error: any) {
      console.error('[PatientFiles] Erro ao alterar tipo:', error);
      await showAlert(error?.message || 'Não foi possível alterar o tipo do arquivo.', {
        title: 'Falha ao salvar',
        variant: 'danger',
        icon: 'warning',
      });
    } finally {
      setSavingType(false);
    }
  };

  const handleDeleteFile = async (file: PatientFileRecord) => {
    const confirmed = await showConfirm(
      `Excluir “${file.originalFileName}”? O arquivo também será removido da pasta do paciente no Google Drive.`,
      {
        title: 'Excluir arquivo',
        confirmLabel: 'Excluir',
        cancelLabel: 'Cancelar',
        variant: 'danger',
        icon: 'warning',
      }
    );
    if (!confirmed) return;

    if (!googleAccessToken || !hasFreshClinicalAccess) {
      await showAlert('Reconecte sua conta Google antes de excluir um arquivo do Drive.', {
        title: 'Conexão com o Google necessária',
        variant: 'warning',
        icon: 'warning',
      });
      return;
    }

    setDeletingFileId(file.id);
    try {
      try {
        await deleteGoogleFile(googleAccessToken, file.googleDriveFileId);
      } catch (driveError) {
        if (isGoogleAuthError(driveError)) {
          setGoogleAccessToken(null);
          throw driveError;
        }
        if (!isGoogleFileMissingError(driveError)) throw driveError;
      }

      await deletePatientFileRecord(file.id);
      setFiles((current) => current.filter((item) => item.id !== file.id));
    } catch (error: any) {
      console.error('[PatientFiles] Erro ao excluir arquivo:', error);
      await showAlert(error?.message || 'Não foi possível excluir o arquivo.', {
        title: 'Falha ao excluir',
        variant: 'danger',
        icon: 'warning',
      });
    } finally {
      setDeletingFileId(null);
    }
  };

  const pendingReadyCount = useMemo(
    () => pending.filter((item) => !validatePendingFile(item)).length,
    [pending]
  );

  return (
    <div className="card !overflow-visible p-5 sm:p-6 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Paperclip size={19} className="text-brand-primary" />
            <h3 className="font-semibold text-brand-text">Arquivos do paciente</h3>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-brand-text-muted">
            Documentos e arquivos ficam salvos na pasta vinculada do Google Drive.
          </p>
        </div>

        {targetFolderId && (
          <div className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-brand-primary/15 bg-brand-primary/5 px-2.5 py-1 text-[10px] font-semibold text-brand-primary">
            <FolderOpen size={12} />
            <span className="truncate">{targetFolderName || 'Pasta vinculada'}</span>
          </div>
        )}
      </div>

      {!targetFolderId ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-700" />
            <div className="space-y-2">
              <div>
                <p className="text-sm font-semibold text-amber-900">Pasta do paciente não vinculada</p>
                <p className="mt-1 text-xs leading-relaxed text-amber-800">
                  Para adicionar arquivos, primeiro vincule uma pasta do Google Drive a este paciente.
                </p>
              </div>
              <Link to={editPatientHref} className="inline-flex text-xs font-bold text-brand-primary hover:underline">
                Vincular pasta
              </Link>
            </div>
          </div>
        </div>
      ) : !hasFreshClinicalAccess ? (
        <div className="rounded-2xl border border-brand-primary/15 bg-brand-primary/[0.04] p-4">
          <div className="flex items-start gap-3">
            <RefreshCw size={18} className="mt-0.5 shrink-0 text-brand-primary" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-brand-text">Conecte novamente o Google Drive</p>
              <p className="mt-1 text-xs leading-relaxed text-brand-text-muted">
                A conexão com o Google é necessária para adicionar ou excluir arquivos da pasta deste paciente.
              </p>
              <button
                type="button"
                onClick={() => void startGoogleAuthorization()}
                disabled={authLoading}
                className="mt-3 btn-primary inline-flex items-center gap-2 px-3 py-2 text-xs"
              >
                {authLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Reconectar Google
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT_ATTRIBUTE}
            onChange={handleInputChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
            onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
            onDragLeave={(event) => { event.preventDefault(); setDragActive(false); }}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              const dropped = Array.from(event.dataTransfer.files || []);
              if (dropped.length > 0) void appendSelectedFiles(dropped);
            }}
            className={`w-full rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
              dragActive
                ? 'border-brand-primary bg-brand-primary/10'
                : 'border-brand-primary/25 bg-brand-primary/[0.03] hover:border-brand-primary/50 hover:bg-brand-primary/[0.06]'
            }`}
          >
            <UploadCloud size={28} className="mx-auto text-brand-primary" />
            <p className="mt-2 text-sm font-semibold text-brand-text">Adicionar arquivos</p>
            <p className="mt-1 text-[11px] text-brand-text-muted">
              Clique ou arraste arquivos para cá · PDF, imagens, Word, Excel, CSV ou TXT · até 25 MB por arquivo
            </p>
          </button>
        </>
      )}

      {pending.length > 0 && (
        <div className="space-y-3 rounded-2xl border border-brand-border/70 bg-brand-bg/20 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-brand-text">Arquivos para enviar</p>
              <p className="text-[10px] text-brand-text-muted">Escolha o tipo de cada arquivo antes do envio.</p>
            </div>
            <button
              type="button"
              onClick={() => setPending([])}
              disabled={uploading}
              className="text-[11px] font-semibold text-brand-text-muted hover:text-red-600 disabled:opacity-40"
            >
              Limpar seleção
            </button>
          </div>

          {pending.map((item) => (
            <div key={item.id} className="rounded-xl border border-brand-border/60 bg-white p-3">
              <div className="flex items-start gap-3">
                <Paperclip size={17} className="mt-1 shrink-0 text-brand-primary" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-brand-text">{item.file.name}</p>
                      <p className="mt-0.5 text-[10px] text-brand-text-muted">
                        {getExtension(item.file.name).toUpperCase() || 'Arquivo'} · {formatBytes(item.file.size)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPending((current) => current.filter((entry) => entry.id !== item.id))}
                      disabled={item.status === 'uploading'}
                      className="rounded-lg p-1 text-brand-text-muted hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                      aria-label="Remover arquivo da seleção"
                    >
                      <X size={15} />
                    </button>
                  </div>

                  <div className="mt-3 space-y-2">
                    <TypeDropdown
                      value={item.fileTypeKey}
                      open={openTypeMenuId === item.id}
                      disabled={item.status === 'uploading'}
                      onToggle={() => setOpenTypeMenuId((current) => current === item.id ? null : item.id)}
                      onSelect={(value) => {
                        setPending((current) => current.map((entry) => (
                          entry.id === item.id
                            ? { ...entry, fileTypeKey: value, customTypeLabel: value === 'other' ? entry.customTypeLabel : '', error: undefined }
                            : entry
                        )));
                        setOpenTypeMenuId(null);
                      }}
                    />

                    {item.fileTypeKey === 'other' && (
                      <input
                        type="text"
                        value={item.customTypeLabel}
                        maxLength={80}
                        disabled={item.status === 'uploading'}
                        onChange={(event) => setPending((current) => current.map((entry) => (
                          entry.id === item.id ? { ...entry, customTypeLabel: event.target.value, error: undefined } : entry
                        )))}
                        placeholder="Nome do tipo. Ex.: Relatório escolar"
                        className="w-full rounded-xl border border-brand-border bg-white px-3 py-2.5 text-xs outline-none focus:border-brand-primary disabled:opacity-50"
                      />
                    )}

                    {item.status === 'uploading' && (
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-brand-primary">
                        <Loader2 size={13} className="animate-spin" />
                        Enviando para o Google Drive...
                      </div>
                    )}
                    {item.status === 'error' && (
                      <p className="text-[11px] font-medium text-red-600">{item.error || 'Falha no envio.'}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => void handleUploadAll()}
            disabled={!canUpload || uploading || pending.length === 0 || pendingReadyCount !== pending.length}
            className="btn-primary flex w-full items-center justify-center gap-2 py-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? <Loader2 size={15} className="animate-spin" /> : <UploadCloud size={15} />}
            {uploading
              ? 'Enviando arquivos...'
              : `Enviar ${pending.length} arquivo${pending.length === 1 ? '' : 's'}`}
          </button>
        </div>
      )}

      <div className="border-t border-brand-border/50 pt-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-brand-text">Arquivos salvos</p>
            <p className="text-[10px] text-brand-text-muted">{files.length} arquivo{files.length === 1 ? '' : 's'} neste paciente</p>
          </div>
          <button
            type="button"
            onClick={() => void loadFiles()}
            disabled={loading}
            className="rounded-lg p-2 text-brand-primary hover:bg-brand-primary/5 disabled:opacity-40"
            title="Atualizar lista"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-brand-text-muted">
            <Loader2 size={17} className="animate-spin text-brand-primary" />
            Carregando arquivos...
          </div>
        ) : files.length === 0 ? (
          <div className="rounded-xl border border-dashed border-brand-border py-8 text-center">
            <Paperclip size={22} className="mx-auto text-brand-text-muted/60" />
            <p className="mt-2 text-xs font-semibold text-brand-text">Nenhum arquivo adicionado</p>
            <p className="mt-1 text-[10px] text-brand-text-muted">Os arquivos enviados aparecerão aqui para acesso rápido.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {files.map((file) => {
              const fileType = getPatientFileType(file.fileTypeKey);
              const TypeIcon = fileType.icon;
              const editing = editingFileId === file.id;

              return (
                <div key={file.id} className="rounded-xl border border-brand-border/60 bg-white p-3 transition-colors hover:border-brand-primary/25">
                  {editing ? (
                    <div className="space-y-2">
                      <TypeDropdown
                        value={editTypeKey}
                        open={openTypeMenuId === `edit-${file.id}`}
                        disabled={savingType}
                        onToggle={() => setOpenTypeMenuId((current) => current === `edit-${file.id}` ? null : `edit-${file.id}`)}
                        onSelect={(value) => {
                          setEditTypeKey(value);
                          if (value !== 'other') setEditTypeLabel('');
                          setOpenTypeMenuId(null);
                        }}
                      />
                      {editTypeKey === 'other' && (
                        <input
                          type="text"
                          value={editTypeLabel}
                          maxLength={80}
                          onChange={(event) => setEditTypeLabel(event.target.value)}
                          placeholder="Nome do tipo"
                          className="w-full rounded-xl border border-brand-border bg-white px-3 py-2.5 text-xs outline-none focus:border-brand-primary"
                        />
                      )}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void saveEditedType(file)}
                          disabled={savingType || !editTypeKey || (editTypeKey === 'other' && !editTypeLabel.trim())}
                          className="btn-primary inline-flex items-center gap-1.5 px-3 py-2 text-[11px]"
                        >
                          {savingType ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                          Salvar
                        </button>
                        <button
                          type="button"
                          onClick={() => { setEditingFileId(null); setOpenTypeMenuId(null); }}
                          disabled={savingType}
                          className="btn-outline px-3 py-2 text-[11px]"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      <div className="rounded-xl bg-brand-primary/10 p-2 text-brand-primary">
                        <TypeIcon size={18} />
                      </div>

                      <a
                        href={file.googleDriveWebViewLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-w-0 flex-1 group"
                      >
                        <p className="break-words text-xs font-semibold text-brand-text group-hover:text-brand-primary group-hover:underline">
                          {file.originalFileName}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-brand-text-muted">
                          <span className="font-semibold text-brand-primary">{file.fileTypeLabel}</span>
                          <span>{getExtension(file.originalFileName).toUpperCase() || 'Arquivo'}</span>
                          <span>{formatBytes(file.sizeBytes)}</span>
                          <span>{formatDate(file.createdAt)}</span>
                        </div>
                      </a>

                      <div className="flex shrink-0 items-center gap-1">
                        <a
                          href={file.googleDriveWebViewLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg p-1.5 text-brand-primary hover:bg-brand-primary/5"
                          title="Abrir no Google Drive"
                          aria-label="Abrir no Google Drive"
                        >
                          <ExternalLink size={15} />
                        </a>
                        <button
                          type="button"
                          onClick={() => beginEditType(file)}
                          className="rounded-lg p-1.5 text-brand-text-muted hover:bg-brand-bg hover:text-brand-primary"
                          title="Alterar tipo"
                          aria-label="Alterar tipo"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteFile(file)}
                          disabled={deletingFileId === file.id}
                          className="rounded-lg p-1.5 text-brand-text-muted hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                          title="Excluir arquivo"
                          aria-label="Excluir arquivo"
                        >
                          {deletingFileId === file.id
                            ? <Loader2 size={15} className="animate-spin" />
                            : <Trash2 size={15} />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
