import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/authStore';
import { v4 as uuidv4 } from 'uuid';
import { Crop, FileText, Link as LinkIcon, Plus, Loader2, FolderOpen, X, FolderPlus, ChevronRight, ChevronLeft, Home, Search, Folder, RefreshCw, Trash2, File, HelpCircle, ShieldCheck, Lock, Upload, UserRound, Phone, MapPin, CalendarClock, StickyNote } from 'lucide-react';
import { createGoogleDoc, createGoogleFolder, listGoogleFiles, deleteGoogleFile } from '../services/googleDocs';
import { sendNotification } from '../services/notificationHelper';
import { deferOnboarding, setOnboardingState, getOnboardingState } from '../utils/onboarding';
import { classifyOnboardingError } from '../utils/onboardingState';
import { GoogleSecurityModal } from '../components/common/GoogleSecurityModal';
import { GooglePermissionRecoveryModal } from '../components/common/GooglePermissionRecoveryModal';
import { FeatureGuideModal, type FeatureGuideStep } from '../components/common/FeatureGuideModal';
import { FeatureGuideButton } from '../components/common/FeatureGuideButton';
import { GOOGLE_SCOPE_SETS, hasGoogleScopes, isGoogleScopeError, requestGoogleOAuth, getCurrentGoogleOAuthRedirectUrl } from '../services/googleAuth';
import TemplateExplanationModal from '../components/common/TemplateExplanationModal';
import { showAlert, showConfirm, showPrompt } from '../store/modalStore';
import { PanelPageHeader } from '../components/layout/PanelPageHeader';
import { trackEvent } from '../services/analytics';
import { trackLifecycleEvent } from '../services/lifecycleTelemetry';
import { createCroppedImageBlob, ImageCropEditor } from '../components/common/ImageCropEditor';
import {
  createPatientPhotoSignedUrl,
  removePatientPhoto,
  uploadPatientPhoto,
  validatePatientPhotoSource,
} from '../services/patientPhoto';
import {
  DEFAULT_WHATSAPP_COUNTRY,
  formatWhatsAppNationalNumber,
  getWhatsAppCountryCallingCode,
  getWhatsAppCountryOptions,
  splitStoredWhatsAppNumber,
  type CountryCode,
} from '../utils/whatsappNumber';
import {
  PATIENT_SESSION_WEEKDAYS,
  normalizePatientSessionSchedule,
  sessionScheduleToLegacy,
  type PatientSessionScheduleEntry,
} from '../utils/patientSessionSchedule';
import { fetchBrazilianAddress, formatPostalCode, isCompletePostalCode } from '../services/cep';
import {
  clearPatientFormDraft,
  getPatientFormDraftKey,
  getLegacyPatientFormDraftKey,
  readPatientFormDraft,
  writePatientFormDraft,
} from '../utils/patientFormDraft';
import {
  getPatientGoogleSetupAlert,
  getPatientGoogleSetupState,
} from '../utils/patientGoogleSetup';

declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

const PATIENT_PHONE_COUNTRY_OPTIONS = getWhatsAppCountryOptions();

const PATIENT_EDIT_GUIDE_STEPS: FeatureGuideStep[] = [
  {
    title: 'Revise os dados do paciente',
    description: 'Atualize nome, nascimento, documento, telefone, observações e status. A foto pode ser adicionada, trocada, ajustada ou removida antes de salvar.',
    icon: FileText,
  },
  {
    title: 'Configure a agenda e os lembretes',
    description: 'Defina os dias e horários das sessões. Se ativar os lembretes de evolução, mantenha pelo menos um horário válido configurado para o paciente.',
    icon: ShieldCheck,
  },
  {
    title: 'Organize o prontuário no Google Drive',
    description: 'Conecte ou reautorize o Google quando necessário, crie um prontuário no Google Docs ou vincule uma pasta existente pelo link. A escolha da pasta fica associada ao paciente.',
    icon: FolderOpen,
  },
  {
    title: 'Confirme as alterações',
    description: 'Clique em “Salvar Paciente” para atualizar o cadastro. Se houver uma foto nova, ela será enviada; a foto anterior será removida quando a troca for concluída.',
    icon: Upload,
  },
  {
    title: 'Continue pelo prontuário atualizado',
    description: 'Depois de salvar, você volta à lista de pacientes e pode abrir o registro atualizado para acessar evoluções, sessões, anamnese, arquivos e relatórios.',
    icon: Lock,
  },
];

const PATIENT_EDIT_SUPPORT_HREF = `/painel/support?${new URLSearchParams({
  new: '1',
  subject: 'Dúvida sobre a Edição do Paciente',
  category: 'general',
  description: 'Olá! Estou com uma dúvida sobre a edição do paciente.\n\nMinha dúvida:\n\n',
}).toString()}`;

type PatientEditGuideButtonProps = {
  compact?: boolean;
  expanded: boolean;
  onOpen: () => void;
};

function PatientEditGuideButton({ compact = false, expanded, onOpen }: PatientEditGuideButtonProps) {
  return (
    <FeatureGuideButton
      label="a edição do paciente"
      compact={compact}
      expanded={expanded}
      onOpen={onOpen}
    />
  );
}

function PatientFormSection({ title, description, icon: Icon, children, required = false, attention = false, sectionRef }: { title: string; description?: string; icon: React.ComponentType<{ size?: number; 'aria-hidden'?: boolean }>; children: React.ReactNode; required?: boolean; attention?: boolean; sectionRef?: React.Ref<HTMLElement> }) {
  return (
    <section ref={sectionRef} className={`space-y-5 border-b border-brand-border/70 pb-8 last:border-b-0 last:pb-0 scroll-mt-6 transition-shadow duration-300 ${attention ? 'rounded-2xl border border-brand-primary/60 bg-brand-primary/[0.025] p-4 shadow-[0_0_0_3px_rgba(37,99,235,0.08)] sm:p-5' : ''}`} aria-labelledby={`patient-form-section-${title}`}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-primary/8 text-brand-primary ring-1 ring-brand-primary/15">
          <Icon size={16} aria-hidden={true} />
        </span>
        <div className="min-w-0">
          <h2 id={`patient-form-section-${title}`} className="flex flex-wrap items-center gap-2 text-base font-semibold text-brand-primary">
            <span>{title}</span>
            {required && <span className="rounded-full border border-brand-primary/20 bg-brand-primary/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-primary">Obrigatório</span>}
          </h2>
          {description && <p className="mt-1 text-xs leading-relaxed text-brand-text-muted">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

type PatientFormValues = {
  full_name: string;
  birth_date: string;
  cpf: string;
  phone: string;
  notes: string;
  status: 'active' | 'inactive';
  google_doc_id: string;
  google_doc_name: string;
  google_doc_url: string;
  target_folder_id: string;
  target_folder_name: string;
  evolution_reminder_active: boolean;
  evolution_reminder_delay_hours: number;
  session_schedule: PatientSessionScheduleEntry[];
  default_template_id: string;
  postal_code: string;
  street: string;
  address_number: string;
  address_complement: string;
  neighborhood: string;
  city: string;
  state: string;
};

const GOOGLE_FOLDER_PREFERENCE_PREFIX = 'evolucao-clinica:last-google-folder';

const getGoogleFolderPreferenceKeys = (userId: string) => ({
  id: `${GOOGLE_FOLDER_PREFERENCE_PREFIX}:${userId}:id`,
  name: `${GOOGLE_FOLDER_PREFERENCE_PREFIX}:${userId}:name`,
});

const readGoogleFolderPreference = (userId: string) => {
  const keys = getGoogleFolderPreferenceKeys(userId);
  const id = localStorage.getItem(keys.id) || '';
  return id
    ? { id, name: localStorage.getItem(keys.name) || 'Pasta selecionada' }
    : null;
};

const saveGoogleFolderPreference = (userId: string | undefined, folderId: string, folderName: string) => {
  if (!userId) return;
  const keys = getGoogleFolderPreferenceKeys(userId);
  localStorage.setItem(keys.id, folderId);
  localStorage.setItem(keys.name, folderName);
};

const clearGoogleFolderPreference = (userId: string | undefined) => {
  if (userId) {
    const keys = getGoogleFolderPreferenceKeys(userId);
    localStorage.removeItem(keys.id);
    localStorage.removeItem(keys.name);
  }
  // Remove a preferência antiga, que não era associada à conta Google.
  localStorage.removeItem('last_google_folder_id');
  localStorage.removeItem('last_google_folder_name');
};

const emptyPatientFormValues = (): PatientFormValues => ({
  full_name: '',
  birth_date: '',
  cpf: '',
  phone: '',
  notes: '',
  status: 'active',
  google_doc_id: '',
  google_doc_name: '',
  google_doc_url: '',
  target_folder_id: '',
  target_folder_name: '',
  evolution_reminder_active: false,
  evolution_reminder_delay_hours: 1,
  session_schedule: [],
  default_template_id: '',
  postal_code: '',
  street: '',
  address_number: '',
  address_complement: '',
  neighborhood: '',
  city: '',
  state: '',
});

const formatCpf = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
};

const PATIENT_PHOTO_BASE64_CHUNK_BYTES = 0x8000;

const readPatientPhotoAsDataUrl = async (value: Blob): Promise<string> => {
  try {
    const bytes = new Uint8Array(await value.arrayBuffer());
    if (bytes.byteLength === 0) throw new Error('empty image');

    let binary = '';
    for (let offset = 0; offset < bytes.byteLength; offset += PATIENT_PHOTO_BASE64_CHUNK_BYTES) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + PATIENT_PHOTO_BASE64_CHUNK_BYTES));
    }

    return `data:${value.type || 'application/octet-stream'};base64,${window.btoa(binary)}`;
  } catch {
    throw new Error('Não foi possível ler a imagem selecionada.');
  }
};

export default function PatientForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    user,
    googleAccessToken,
    googleGrantedScopes,
    googleAuthorizationStatus,
    googleMissingScopes,
    setGoogleAccessToken,
    setGoogleAuthorizationStatus,
  } = useAuthStore();
  const onboardingState = getOnboardingState(user?.id);
  // O parâmetro é o contexto explícito transmitido pelo fluxo de onboarding.
  // Um estado pendente, sozinho, não transforma uma criação comum em onboarding.
  const isOnboardingMode = searchParams.get('onboarding') === '1';
  const hasGoogleSession = Boolean(googleAccessToken);
  const hasClinicalAccess = Boolean(googleAccessToken) && hasGoogleScopes(googleGrantedScopes, GOOGLE_SCOPE_SETS.clinicalDocs);
  const restoredDraftScopeRef = useRef<string | null>(null);
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>(DEFAULT_WHATSAPP_COUNTRY);
  const ddi = `+${getWhatsAppCountryCallingCode(phoneCountry)}`;
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);
  const [isOnboardingGateModalOpen, setIsOnboardingGateModalOpen] = useState(false);
  const [isGooglePermissionModalOpen, setIsGooglePermissionModalOpen] = useState(false);
  const [isReauthenticating, setIsReauthenticating] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  
  // Custom Folder Explorer State
  const [showExplorer, setShowExplorer] = useState(false);
  const [explorerMode, setExplorerMode] = useState<'folder' | 'file'>('folder');
  const [explorerPath, setExplorerPath] = useState<{id: string, name: string}[]>([{id: 'root', name: 'Meu Drive'}]);
  const [explorerFolders, setExplorerFolders] = useState<any[]>([]);
  const [isLoadingExplorer, setIsLoadingExplorer] = useState(false);
  const [explorerSearch, setExplorerSearch] = useState('');

  // Vincular pasta pelo link
  const [showLinkFolder, setShowLinkFolder] = useState(false);
  const [linkFolderUrl, setLinkFolderUrl] = useState('');
  const [linkFolderName, setLinkFolderName] = useState('');
  const [showLinkFolderHelp, setShowLinkFolderHelp] = useState(false);
  const [linkFolderHelpTab, setLinkFolderHelpTab] = useState<'browser' | 'mobile'>('browser');
  const [isGlobalSearch, setIsGlobalSearch] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [isExitingOnboarding, setIsExitingOnboarding] = useState(false);
  const [creatingDoc, setCreatingDoc] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [isTemplateHelpOpen, setIsTemplateHelpOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [formData, setFormData] = useState<PatientFormValues>(emptyPatientFormValues);
  const [draftReady, setDraftReady] = useState(false);
  const [draftSaveStatus, setDraftSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [photoPath, setPhotoPath] = useState('');
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState('');
  const [photoEditorUrl, setPhotoEditorUrl] = useState('');
  const [pendingPhotoBlob, setPendingPhotoBlob] = useState<Blob | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [googleSetupAttention, setGoogleSetupAttention] = useState(false);
  const googleSetupSectionRef = useRef<HTMLElement | null>(null);
  const patientLoadedRef = useRef(!id);
  const legacyGoogleSetupPendingRef = useRef(false);
  const googleSetupAttentionTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (googleAuthorizationStatus === 'missing_scopes' && googleMissingScopes.some((scope) => scope === GOOGLE_SCOPE_SETS.clinicalDocs[0])) {
      setIsGooglePermissionModalOpen(true);
    } else if (googleAuthorizationStatus === 'authorized') {
      setIsGooglePermissionModalOpen(false);
    }
  }, [googleAuthorizationStatus, googleMissingScopes]);

  useEffect(() => () => {
    if (googleSetupAttentionTimerRef.current) window.clearTimeout(googleSetupAttentionTimerRef.current);
  }, []);
  const [showPhotoEditor, setShowPhotoEditor] = useState(false);
  const [preparingPhoto, setPreparingPhoto] = useState(false);
  const pendingPatientIdRef = useRef<string | null>(null);
  const draftBaselineRef = useRef<string | null>(null);
  const [postalCodeLookupState, setPostalCodeLookupState] = useState<'idle' | 'loading' | 'not-found' | 'error'>('idle');
  const postalCodeLookupRef = useRef<AbortController | null>(null);
  const lastLookedUpPostalCodeRef = useRef('');

  const getDraftPatientId = () => pendingPatientIdRef.current || id || undefined;

  const getCurrentDraftKey = () => user?.id
    ? getPatientFormDraftKey(user.id, id, isOnboardingMode)
    : null;

  const getLegacyDraftKey = () => user?.id
    ? getLegacyPatientFormDraftKey(user.id, window.location.pathname)
    : null;

  const clearCurrentDraft = () => {
    const currentKey = getCurrentDraftKey();
    if (currentKey) clearPatientFormDraft(currentKey);
    const legacyKey = getLegacyDraftKey();
    if (legacyKey && legacyKey !== currentKey) clearPatientFormDraft(legacyKey);
  };

  const getDraftSignature = (values: PatientFormValues, country: CountryCode) => JSON.stringify({
    formData: values,
    phoneCountry: country,
    ddi: `+${getWhatsAppCountryCallingCode(country)}`,
  });

  const persistDraftNow = () => {
    const key = getCurrentDraftKey();
    if (!key) return false;
    const saved = writePatientFormDraft<PatientFormValues>(key, {
      patientId: getDraftPatientId() || null,
      formData,
      ddi,
      phoneCountry,
      savedAt: new Date().toISOString(),
    });
    if (saved) {
      draftBaselineRef.current = getDraftSignature(formData, phoneCountry);
      setDraftSaveStatus('saved');
    } else {
      setDraftSaveStatus('error');
    }
    return saved;
  };

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const { data, error } = await supabase
          .from('evolution_templates')
          .select('*')
          .order('name');
        if (!error && data) {
          setTemplates(data);
        }
      } catch (err) {
        console.error("Erro ao buscar templates:", err);
      }
    };
    fetchTemplates();
  }, []);

  useEffect(() => {
    if (!user?.id || id) return;

    const key = getPatientFormDraftKey(user.id, undefined, isOnboardingMode);
    if (restoredDraftScopeRef.current === key) return;
    setDraftReady(false);
    const draft = readPatientFormDraft<PatientFormValues>(key)
      || readPatientFormDraft<PatientFormValues>(getLegacyPatientFormDraftKey(user.id, window.location.pathname));
    restoredDraftScopeRef.current = key;

    if (draft) {
      pendingPatientIdRef.current = draft.patientId || null;
      const restoredFormData = { ...emptyPatientFormValues(), ...draft.formData };
      draftBaselineRef.current = getDraftSignature(restoredFormData, draft.phoneCountry as CountryCode || DEFAULT_WHATSAPP_COUNTRY);
      setFormData(restoredFormData);
      lastLookedUpPostalCodeRef.current = String(draft.formData?.postal_code || '').replace(/\D/g, '');
      const restoredPhone = splitStoredWhatsAppNumber(
        `${draft.ddi || ''}${draft.formData?.phone || ''}`,
        DEFAULT_WHATSAPP_COUNTRY,
      );
      setPhoneCountry((draft.phoneCountry as CountryCode) || restoredPhone.country);
      setDraftReady(true);
      return;
    }

    const savedFolder = readGoogleFolderPreference(user.id);
    const initialFormData = {
      ...emptyPatientFormValues(),
      ...(savedFolder ? {
        target_folder_id: savedFolder.id,
        target_folder_name: savedFolder.name,
      } : {}),
    };
    draftBaselineRef.current = getDraftSignature(initialFormData, phoneCountry);
    if (savedFolder) {
      setFormData(initialFormData);
    }
    setDraftReady(true);
  }, [id, isOnboardingMode, user?.id]);

  useEffect(() => {
    if (!user?.id || !draftReady) return;

    const key = getCurrentDraftKey();
    if (!key) return;
    const signature = getDraftSignature(formData, phoneCountry);
    if (signature === draftBaselineRef.current) return;

    const timer = window.setTimeout(() => {
      setDraftSaveStatus('saving');
      const saved = writePatientFormDraft<PatientFormValues>(key, {
        patientId: getDraftPatientId() || null,
        formData,
        ddi,
        phoneCountry,
        savedAt: new Date().toISOString(),
      });
      if (saved) {
        draftBaselineRef.current = signature;
        setDraftSaveStatus('saved');
      } else {
        setDraftSaveStatus('error');
      }
    }, 400);

    return () => window.clearTimeout(timer);
  }, [ddi, draftReady, formData, id, phoneCountry, user?.id]);

  useEffect(() => {
    if (id) {
      patientLoadedRef.current = false;
      legacyGoogleSetupPendingRef.current = false;
      setDraftReady(false);
      const fetchPatient = async () => {
        try {
          const { data, error } = await supabase
            .from('patients')
            .select('*')
            .eq('id', id)
            .single();
          
          if (error) throw error;
          if (data) {
            patientLoadedRef.current = true;
            legacyGoogleSetupPendingRef.current = getPatientGoogleSetupState(data) !== 'complete';
            const storedPhone = splitStoredWhatsAppNumber(
              data.phone || '',
              DEFAULT_WHATSAPP_COUNTRY,
            );

            const patientFormData: PatientFormValues = {
              full_name: data.full_name || '',
              birth_date: data.birth_date || '',
              cpf: formatCpf(data.cpf || ''),
              phone: storedPhone.nationalNumber,
              notes: data.notes || '',
              status: (data.status === 'inactive' ? 'inactive' : 'active'),
              google_doc_id: data.google_doc_id || '',
              google_doc_name: data.google_doc_name || '',
              google_doc_url: data.google_doc_url || '',
              target_folder_id: data.target_folder_id || '',
              target_folder_name: data.target_folder_name || '',
              evolution_reminder_active: data.evolution_reminder_active ?? false,
              evolution_reminder_delay_hours: Number(data.evolution_reminder_delay_hours ?? 1),
              session_schedule: normalizePatientSessionSchedule(data.session_schedule, data.session_days, data.session_time),
              default_template_id: data.default_template_id || '',
              postal_code: formatPostalCode(data.postal_code || ''),
              street: data.street || '',
              address_number: data.address_number || '',
              address_complement: data.address_complement || '',
              neighborhood: data.neighborhood || '',
              city: data.city || '',
              state: data.state || '',
            };
            const draft = user?.id
              ? readPatientFormDraft<PatientFormValues>(getPatientFormDraftKey(user.id, id, isOnboardingMode))
                || readPatientFormDraft<PatientFormValues>(getLegacyPatientFormDraftKey(user.id, window.location.pathname))
              : null;
            const draftIsNewer = Boolean(draft?.savedAt)
              && (!data.updated_at || Date.parse(draft!.savedAt) > Date.parse(data.updated_at));
            const restoredFormData = draftIsNewer
              ? { ...patientFormData, ...draft!.formData }
              : patientFormData;
            const restoredPhoneCountry = draftIsNewer && draft?.phoneCountry
              ? draft.phoneCountry as CountryCode
              : storedPhone.country;
            draftBaselineRef.current = getDraftSignature(restoredFormData, restoredPhoneCountry);
            setFormData(restoredFormData);
            lastLookedUpPostalCodeRef.current = String(data.postal_code || '').replace(/\D/g, '');
            setPhoneCountry(restoredPhoneCountry);
            setDraftReady(true);
            const storedPhotoPath = String(data.photo_path || '');
            setPhotoPath(storedPhotoPath);
            setPhotoRemoved(false);
            if (storedPhotoPath) {
              try {
                setPhotoPreviewUrl(await createPatientPhotoSignedUrl(storedPhotoPath));
              } catch (photoError) {
                console.warn('[PatientForm] Não foi possível carregar a foto privada:', photoError);
                setPhotoPreviewUrl('');
              }
            }
          }
        } catch (error) {
          console.error("Error fetching patient:", error);
        }
      };
      fetchPatient();
    }
  }, [id, user?.id]);

  useEffect(() => () => postalCodeLookupRef.current?.abort(), []);

  const lookupPostalCode = async (value: string) => {
    const normalized = value.replace(/\D/g, '');
    if (!isCompletePostalCode(normalized) || normalized === lastLookedUpPostalCodeRef.current) return;
    postalCodeLookupRef.current?.abort();
    const controller = new AbortController();
    postalCodeLookupRef.current = controller;
    lastLookedUpPostalCodeRef.current = normalized;
    setPostalCodeLookupState('loading');
    try {
      const address = await fetchBrazilianAddress(normalized, controller.signal);
      if (!address) {
        setPostalCodeLookupState('not-found');
        return;
      }
      setFormData((current) => ({
        ...current,
        postal_code: address.postal_code,
        street: address.street,
        address_complement: address.address_complement || current.address_complement,
        neighborhood: address.neighborhood,
        city: address.city,
        state: address.state,
      }));
      setPostalCodeLookupState('idle');
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return;
      lastLookedUpPostalCodeRef.current = '';
      console.warn('[PatientForm] Não foi possível consultar o CEP:', error);
      setPostalCodeLookupState('error');
    }
  };

  const handlePhotoSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    const validationError = validatePatientPhotoSource(file);
    if (validationError) {
      await showAlert(validationError, {
        title: 'Foto inválida',
        variant: 'warning',
        icon: 'warning',
      });
      input.value = '';
      return;
    }

    setPreparingPhoto(true);

    try {
      const sourceUrl = await readPatientPhotoAsDataUrl(file);
      const initialCrop = await createCroppedImageBlob({
        imageUrl: sourceUrl,
        aspect: 1,
        zoom: 1,
        position: { x: 0, y: 0 },
        outputWidth: 600,
      });
      const previewUrl = await readPatientPhotoAsDataUrl(initialCrop);

      setPendingPhotoBlob(initialCrop);
      setPhotoPreviewUrl(previewUrl);
      setPhotoEditorUrl(sourceUrl);
      setPhotoRemoved(false);
      setShowPhotoEditor(true);
    } catch (error) {
      console.error('[PatientForm] Não foi possível preparar a foto selecionada:', error);
      await showAlert(`Erro ao preparar a foto: ${error instanceof Error ? error.message : error}`, {
        title: 'Erro na Foto',
        variant: 'danger',
        icon: 'warning',
      });
    } finally {
      input.value = '';
      setPreparingPhoto(false);
    }
  };

  const handleApplyPatientPhotoCrop = async (croppedPhoto: Blob) => {
    const previewUrl = await readPatientPhotoAsDataUrl(croppedPhoto);
    setPendingPhotoBlob(croppedPhoto);
    setPhotoPreviewUrl(previewUrl);
    setPhotoRemoved(false);
    setShowPhotoEditor(false);
  };

  const handleRemovePatientPhoto = () => {
    setPendingPhotoBlob(null);
    setPhotoPreviewUrl('');
    setPhotoEditorUrl('');
    setPhotoRemoved(Boolean(photoPath));
    setShowPhotoEditor(false);
  };

  useEffect(() => {
    if (isOnboardingMode && user?.id) {
      setOnboardingState(user.id, { step: 'patient' });
    }
  }, [isOnboardingMode, user?.id]);

  const handleReauthenticate = async () => {
    setIsSecurityModalOpen(true);
  };

  const handleExitOnboarding = async () => {
    if (!isOnboardingMode || !user?.id || isExitingOnboarding) return;

    const confirmed = await showConfirm("Deseja mesmo sair do assistente de configuração e continuar depois? Você poderá criar pacientes e evoluções normalmente no painel.", {
      title: "Sair do Assistente",
      confirmLabel: "Sair",
      cancelLabel: "Continuar",
      variant: "warning",
      icon: "question"
    });
    if (!confirmed) return;

    setIsExitingOnboarding(true);
    try {
      await deferOnboarding(user.id, 'patient');
      clearCurrentDraft();
      navigate('/painel/dashboard');
    } catch (error) {
      console.error('[PatientForm] Não foi possível sair do onboarding:', error);
      await showAlert('Não foi possível sair do onboarding agora. Verifique sua conexão e tente novamente.', {
        title: 'Erro ao sair do onboarding',
        variant: 'danger',
        icon: 'warning',
      });
    } finally {
      setIsExitingOnboarding(false);
    }
  };

  const executeGoogleReauthentication = async (forceConsent = false) => {
    if (pendingPhotoBlob) {
      await showAlert('A foto escolhida ainda não foi salva. Salve o paciente antes de conectar o Google para não perder essa alteração.', {
        title: 'Salve a foto antes de continuar',
        variant: 'warning',
        icon: 'warning',
      });
      return;
    }
    setIsReauthenticating(true);
    try {
      persistDraftNow();
      setIsGooglePermissionModalOpen(false);
      setGoogleAuthorizationStatus('unknown');

      const { error } = await requestGoogleOAuth({
        requiredScopes: 'clinicalDocs',
        currentGrantedScopes: googleGrantedScopes,
        redirectTo: getCurrentGoogleOAuthRedirectUrl(),
        loginHint: user?.email || undefined,
        ...(forceConsent ? { prompt: 'consent' } : {}),
      });
      if (error) throw error;
    } catch (error) {
      console.error("Reauthentication error:", error);
      if (isOnboardingMode && user?.id) {
        const errorCode = classifyOnboardingError(error, 'google_oauth_start_failed');
        void trackLifecycleEvent('onboarding_step_error', {
          metadata: { step: 'patient', source: 'google_oauth', error_code: errorCode },
          dedupeKey: `onboarding_step_error:${user.id}:patient:google_oauth:${errorCode}:${new Date().toISOString().slice(0, 10)}`,
        });
      }
      await showAlert("Erro ao renovar autenticação. Tente novamente.", {
        title: "Erro de Autenticação",
        variant: "danger",
        icon: "warning"
      });
    } finally {
      setIsReauthenticating(false);
    }
  };

  const handleCreateDoc = async () => {
    if (!hasClinicalAccess) {
      await showAlert('Token do Google não encontrado. Por favor, renove sua autenticação.', {
        title: "Autenticação Necessária",
        variant: "warning",
        icon: "warning"
      });
      return;
    }

    if (!formData.target_folder_id) {
      await showAlert('Selecione ou crie uma pasta no Google Drive antes de criar o prontuário.', {
        title: 'Configure a pasta do paciente',
        variant: 'warning',
        icon: 'info',
      });
      googleSetupSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      googleSetupSectionRef.current?.querySelector<HTMLElement>('[data-google-folder-control]')?.focus({ preventScroll: true });
      return;
    }

    if (!formData.full_name) {
      await showAlert('Por favor, preencha o nome do paciente antes de criar o prontuário.', {
        title: "Nome Requerido",
        variant: "warning",
        icon: "warning"
      });
      return;
    }

    setCreatingDoc(true);
    try {
      const title = `Prontuário - ${formData.full_name}`;
      const newDoc = await createGoogleDoc(googleAccessToken, title, formData.target_folder_id);
      setFormData(prev => ({
        ...prev,
        google_doc_id: newDoc.id,
        google_doc_name: newDoc.name,
        google_doc_url: newDoc.url
      }));
    } catch (error: any) {
      console.error("Erro ao criar documento:", error);
      if (isOnboardingMode && user?.id) {
        const errorCode = classifyOnboardingError(error, 'google_doc_create_failed');
        void trackLifecycleEvent('onboarding_step_error', {
          metadata: { step: 'patient', source: 'google_docs', error_code: errorCode },
          dedupeKey: `onboarding_step_error:${user.id}:patient:google_docs:${errorCode}:${new Date().toISOString().slice(0, 10)}`,
        });
      }
      const msg = error.message || "";
      if (isGoogleScopeError(error)) {
        setGoogleAuthorizationStatus('missing_scopes', GOOGLE_SCOPE_SETS.clinicalDocs);
        setIsGooglePermissionModalOpen(true);
      } else if (msg.includes('401') || msg.includes('UNAUTHENTICATED') || msg.includes('Invalid Credentials')) {
        await showAlert("Sua conta precisa autorizar o Google Drive e o Google Docs. Seus dados preenchidos foram preservados; confirme a reconexão para continuar deste ponto.", {
          title: "Permissão do Google necessária",
          variant: "warning",
          icon: "warning"
        });
        setGoogleAccessToken(null);
        setIsSecurityModalOpen(true);
      } else if (msg.includes('userRateLimitExceeded') || msg.includes('rateLimitExceeded') || msg.includes('quotaExceeded')) {
        await showAlert("O Google está limitando temporariamente a criação do documento. Tente novamente em alguns segundos.", {
          title: "Limite do Google",
          variant: "warning",
          icon: "warning"
        });
      } else if (formData.target_folder_id && (msg.includes('404') || msg.includes('File not found') || msg.includes('403'))) {
        setFormData((prev) => ({ ...prev, target_folder_id: '', target_folder_name: '' }));
        clearGoogleFolderPreference(user?.id);
        await showAlert('Não foi possível acessar a pasta de destino. Ela foi removida desta tela; escolha outra pasta ou crie o prontuário no Meu Drive.', {
          title: 'Pasta do Google Drive indisponível',
          variant: 'warning',
          icon: 'warning'
        });
      } else {
        await showAlert("Não foi possível criar o prontuário no Google Docs. Renove a autenticação do Google e tente novamente.", {
          title: "Erro ao Criar Documento",
          variant: "danger",
          icon: "warning"
        });
      }
    } finally {
      setCreatingDoc(false);
    }
  };

  const handleSendTestReminder = async () => {
    if (!formData.full_name) {
      await showAlert('Por favor, preencha o nome do paciente para testar o lembrete.', {
        title: "Nome Requerido",
        variant: "warning",
        icon: "warning"
      });
      return;
    }

    try {
      await sendNotification({
        title: `🔔 Lembrete de Evolução (Teste): ${formData.full_name}`,
        content: `Este é um lembrete de teste para o(a) paciente ${formData.full_name}. Quando ativo, o lembrete será enviado ${formData.evolution_reminder_delay_hours} hora(s) após cada sessão configurada, caso ainda não exista evolução correspondente.`,
        type: 'warning',
        link: id ? `/painel/patients/${id}` : '/painel/patients'
      });
      await showAlert("Lembrete de teste enviado com sucesso! Verifique a página de notificações, e-mail ou push.", {
        title: "Lembrete Enviado",
        variant: "success",
        icon: "success"
      });
    } catch (err: any) {
      console.error("Error sending test reminder:", err);
      await showAlert("Erro ao enviar lembrete de teste: " + (err.message || err), {
        title: "Erro no Envio",
        variant: "danger",
        icon: "warning"
      });
    }
  };

  const loadExplorerFolders = async (parentId: string, tokenOverride?: string, searchTerm: string = '', isGlobal: boolean = false) => {
    if (googleAuthorizationStatus === 'missing_scopes') return;
    const token = tokenOverride || googleAccessToken;
    if (!token) return;
    
    setIsLoadingExplorer(true);
    try {
      const files = await listGoogleFiles(token, parentId, searchTerm, isGlobal);
      // Ordenar: pastas primeiro, depois arquivos
      const sorted = files.sort((a: any, b: any) => {
        if (a.mimeType === b.mimeType) return a.name.localeCompare(b.name);
        return a.mimeType === 'application/vnd.google-apps.folder' ? -1 : 1;
      });
      setExplorerFolders(sorted);
    } catch (error: any) {
      console.error("Explorer load error:", error);
      if (isGoogleScopeError(error)) {
        setGoogleAuthorizationStatus('missing_scopes', GOOGLE_SCOPE_SETS.clinicalDocs);
        setShowExplorer(false);
      } else if (error.message?.includes('401')) {
        setGoogleAccessToken(null);
        setShowExplorer(false);
      }
    } finally {
      setIsLoadingExplorer(false);
    }
  };

  // Debounced Search Effect
  useEffect(() => {
    if (!showExplorer) return;
    
    const timer = setTimeout(() => {
      const current = explorerPath[explorerPath.length - 1];
      loadExplorerFolders(current.id, undefined, explorerSearch, isGlobalSearch);
    }, 500);

    return () => clearTimeout(timer);
  }, [explorerSearch, isGlobalSearch, showExplorer, googleAuthorizationStatus]);

  useEffect(() => {
    if (showExplorer) {
      const current = explorerPath[explorerPath.length - 1];
      loadExplorerFolders(current.id);
    }
  }, [showExplorer, explorerPath, googleAuthorizationStatus]);

  const handleExplorerReauthenticate = async () => {
    if (pendingPhotoBlob) {
      await showAlert('A foto escolhida ainda não foi salva. Salve o paciente antes de conectar o Google para não perder essa alteração.', {
        title: 'Salve a foto antes de continuar',
        variant: 'warning',
        icon: 'warning',
      });
      return;
    }
    setIsReauthenticating(true);
    try {
      persistDraftNow();
      setIsGooglePermissionModalOpen(false);
      setGoogleAuthorizationStatus('unknown');

      const { error } = await requestGoogleOAuth({
        requiredScopes: 'clinicalDocs',
        currentGrantedScopes: googleGrantedScopes,
        redirectTo: getCurrentGoogleOAuthRedirectUrl(),
        prompt: 'consent',
        loginHint: user?.email || undefined
      });
      if (error) throw error;
    } catch (error) {
      console.error("Reauth error:", error);
      await showAlert("Erro ao reautenticar com o Google. Tente novamente.", {
        title: "Erro de Autenticação",
        variant: "danger",
        icon: "warning"
      });
    } finally {
      setIsReauthenticating(false);
    }
  };

  const handleCreateNewFolder = async () => {
    if (!hasClinicalAccess || googleAuthorizationStatus === 'missing_scopes') return;
    
    // Pegar o local atual do explorador
    const currentFolder = explorerPath[explorerPath.length - 1];
    
    const folderName = await showPrompt(`Criar nova pasta dentro de "${currentFolder.name}":`, {
      title: "Nova Pasta",
      placeholder: "Nome da pasta",
      variant: "info",
      icon: "info"
    });
    if (!folderName) return;

    setIsCreatingFolder(true);
    try {
      const newFolder = await createGoogleFolder(googleAccessToken, folderName, currentFolder.id === 'root' ? undefined : currentFolder.id);
      
      // Entrar automaticamente na pasta criada para facilitar a navegação
      handleNavigateDown(newFolder.id, newFolder.name);
      
      await showAlert(`Pasta "${folderName}" criada com sucesso!`, {
        title: "Pasta Criada",
        variant: "success",
        icon: "success"
      });
    } catch (error: any) {
      console.error("Erro ao criar pasta:", error);
      if (isGoogleScopeError(error)) {
        setGoogleAuthorizationStatus('missing_scopes', GOOGLE_SCOPE_SETS.clinicalDocs);
        setShowExplorer(false);
        return;
      }
      await showAlert("Erro ao criar pasta no Google Drive.", {
        title: "Erro ao Criar Pasta",
        variant: "danger",
        icon: "warning"
      });
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleDeleteFolder = async (e: React.MouseEvent, folderId: string, folderName: string) => {
    e.stopPropagation(); // Não navegar para a pasta ao clicar no lixo
    
    const confirmed = await showConfirm(`Tem certeza que deseja excluir a pasta "${folderName}" permanentemente do Google Drive?`, {
      title: "Excluir Pasta",
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar",
      variant: "danger",
      icon: "trash"
    });
    if (!confirmed) return;

    try {
      await deleteGoogleFile(googleAccessToken!, folderId);
      
      // Se a pasta excluída era a selecionada, limpa
      if (formData.target_folder_id === folderId) {
        setFormData(prev => ({ ...prev, target_folder_id: '', target_folder_name: '' }));
        clearGoogleFolderPreference(user?.id);
      }

      // Refresh list
      const current = explorerPath[explorerPath.length - 1];
      loadExplorerFolders(current.id);
      
      await showAlert(`Pasta "${folderName}" excluída com sucesso.`, {
        title: "Pasta Excluída",
        variant: "success",
        icon: "success"
      });
    } catch (error) {
      console.error("Delete error:", error);
      await showAlert("Erro ao excluir pasta.", {
        title: "Erro ao Excluir",
        variant: "danger",
        icon: "warning"
      });
    }
  };

  const handleNavigateDown = (folderId: string, folderName: string) => {
    setExplorerPath(prev => [...prev, { id: folderId, name: folderName }]);
  };

  const handleNavigateUp = (index: number) => {
    setExplorerPath(prev => prev.slice(0, index + 1));
  };

  const handleSelectCurrentFolder = () => {
    const current = explorerPath[explorerPath.length - 1];
    if (current.id === 'root') {
      setFormData(prev => ({ ...prev, target_folder_id: '', target_folder_name: 'Meu Drive (Principal)' }));
      clearGoogleFolderPreference(user?.id);
    } else {
      setFormData(prev => ({ ...prev, target_folder_id: current.id, target_folder_name: current.name }));
      saveGoogleFolderPreference(user?.id, current.id, current.name);
    }
    setShowExplorer(false);
  };

  const handleSelectItem = (item: any) => {
    if (item.mimeType === 'application/vnd.google-apps.folder') {
      handleNavigateDown(item.id, item.name);
    } else if (explorerMode === 'file') {
      // É um arquivo e estamos em modo de seleção de arquivo
      setFormData(prev => ({
        ...prev,
        google_doc_id: item.id,
        google_doc_name: item.name,
        google_doc_url: `https://docs.google.com/document/d/${item.id}/edit`
      }));
      setShowExplorer(false);
    }
  };

  const openExplorer = (mode: 'folder' | 'file') => {
    setExplorerMode(mode);
    setShowExplorer(true);
  };

  const handlePicker = () => {
    openExplorer('file');
  };

  // Extrai o folderId de uma URL do Google Drive ou aceita o ID diretamente
  const parseFolderIdFromUrl = (input: string): string | null => {
    const trimmed = input.trim();
    // URL padrão: https://drive.google.com/drive/folders/{id}
    // URL com user: https://drive.google.com/drive/u/0/folders/{id}
    const urlMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]{10,})/);
    if (urlMatch) return urlMatch[1];
    // ID direto (string alfanumérica de 10+ chars sem espaços)
    if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) return trimmed;
    return null;
  };

  const handleConfirmLinkFolder = async () => {
    const folderId = parseFolderIdFromUrl(linkFolderUrl);
    if (!folderId) {
      await showAlert('URL ou ID de pasta inválido. Copie a URL completa da pasta no Google Drive (ex: https://drive.google.com/drive/folders/...) e cole aqui.', {
        title: "Link Inválido",
        variant: "warning",
        icon: "warning"
      });
      return;
    }
    const name = linkFolderName.trim() || 'Pasta vinculada';
    setFormData(prev => ({ ...prev, target_folder_id: folderId, target_folder_name: name }));
    saveGoogleFolderPreference(user?.id, folderId, name);
    setShowLinkFolder(false);
    setLinkFolderUrl('');
    setLinkFolderName('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const googleSetupState = getPatientGoogleSetupState(formData);
    const shouldRequireGoogleSetup = !id || !patientLoadedRef.current || !legacyGoogleSetupPendingRef.current;
    if (shouldRequireGoogleSetup && googleSetupState !== 'complete') {
      const alert = getPatientGoogleSetupAlert(googleSetupState);
      setGoogleSetupAttention(true);
      if (googleSetupAttentionTimerRef.current) window.clearTimeout(googleSetupAttentionTimerRef.current);
      googleSetupAttentionTimerRef.current = window.setTimeout(() => setGoogleSetupAttention(false), 3200);
      window.requestAnimationFrame(() => {
        googleSetupSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const selector = googleSetupState === 'missing-document'
          ? '[data-google-document-control]'
          : '[data-google-folder-control]';
        window.setTimeout(() => {
          googleSetupSectionRef.current?.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
        }, 250);
      });
      await showAlert(alert.message, {
        title: alert.title,
        variant: 'warning',
        icon: 'info',
      });
      return;
    }

    const incompleteSchedule = formData.session_schedule.some((item) => (
      !Number.isInteger(Number(item.weekday))
      || Number(item.weekday) < 0
      || Number(item.weekday) > 6
      || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(item.time || ''))
    ));
    if (incompleteSchedule) {
      await showAlert('Preencha o dia da semana e o horário de todas as sessões configuradas.', {
        title: 'Agenda incompleta',
        variant: 'warning',
        icon: 'warning'
      });
      return;
    }

    const normalizedSessionSchedule = normalizePatientSessionSchedule(formData.session_schedule);
    if (formData.evolution_reminder_active && normalizedSessionSchedule.length === 0) {
      await showAlert('Configure pelo menos um dia e horário antes de ativar os lembretes de evolução.', {
        title: 'Agenda necessária',
        variant: 'warning',
        icon: 'warning'
      });
      return;
    }
    const legacySchedule = sessionScheduleToLegacy(normalizedSessionSchedule);

    let uploadedPhotoPath = '';
    setLoading(true);
    try {
      const patientId = id || pendingPatientIdRef.current || uuidv4();
      const existingPatientId = id || pendingPatientIdRef.current;
      let nextPhotoPath = photoRemoved ? '' : photoPath;

      if (pendingPhotoBlob) {
        uploadedPhotoPath = await uploadPatientPhoto({
          professionalId: user.id,
          patientId,
          photo: pendingPhotoBlob,
        });
        nextPhotoPath = uploadedPhotoPath;
      }
      
      const patientData: any = {
        id: patientId,
        professional_id: user.id,
        full_name: formData.full_name,
        birth_date: formData.birth_date || null,
        cpf: formData.cpf || null,
        phone: formData.phone
          ? `${ddi} ${formatWhatsAppNationalNumber(formData.phone, phoneCountry)}`
          : null,
        notes: formData.notes,
        status: formData.status,
        updated_at: new Date().toISOString(),
        evolution_reminder_active: formData.evolution_reminder_active,
        evolution_reminder_delay_hours: Math.max(0, Math.min(168, Number(formData.evolution_reminder_delay_hours || 0))),
        session_schedule: normalizedSessionSchedule,
        session_days: legacySchedule.sessionDays,
        session_time: legacySchedule.sessionTime,
        default_template_id: formData.default_template_id || null,
        photo_path: nextPhotoPath || null,
        postal_code: formData.postal_code.replace(/\D/g, '') || null,
        street: formData.street || null,
        address_number: formData.address_number || null,
        address_complement: formData.address_complement || null,
        neighborhood: formData.neighborhood || null,
        city: formData.city || null,
        state: formData.state || null,
      };

      // Só inclui campos do Google Drive se eles tiverem valor (ou envia null de forma explícita)
      patientData.google_doc_id = formData.google_doc_id || null;
      patientData.google_doc_name = formData.google_doc_name || null;
      patientData.google_doc_url = formData.google_doc_url || null;
      patientData.target_folder_id = formData.target_folder_id || null;
      patientData.target_folder_name = formData.target_folder_name || null;

      if (existingPatientId) {
        const { error } = await supabase
          .from('patients')
          .update(patientData)
          .eq('id', existingPatientId);
        if (error) throw error;
        void sendNotification({
          title: 'ℹ️ Dados do Paciente Atualizados',
          content: `As informações do paciente ${formData.full_name} foram atualizadas com sucesso.`,
          type: 'info',
          link: `/painel/patients/${existingPatientId}`
        });
      } else {
        patientData.created_at = new Date().toISOString();
        const { error } = await supabase
          .from('patients')
          .insert(patientData);
        if (error) throw error;
        trackEvent('patient_created', {}, { dedupeKey: `patient_created:${user.id}:${patientId}`, persistDedupe: true });
        void sendNotification({
          title: '✅ Paciente Cadastrado com Sucesso',
          content: `O paciente ${formData.full_name} foi registrado na plataforma e já está disponível no seu prontuário.`,
          type: 'success',
          link: `/painel/patients`
        });
      }

      if (photoPath && photoPath !== nextPhotoPath) {
        try {
          await removePatientPhoto(photoPath);
        } catch (cleanupError) {
          console.warn('[PatientForm] Não foi possível remover a foto anterior:', cleanupError);
        }
      }
      uploadedPhotoPath = '';
      setPhotoPath(nextPhotoPath);
      setPendingPhotoBlob(null);
      setPhotoRemoved(false);

      if (isOnboardingMode) {
        pendingPatientIdRef.current = patientId;

        if (!googleAccessToken) {
          setOnboardingState(user.id, {
            step: 'patient',
            patientId,
            patientName: formData.full_name
          });
          if (!id) {
            persistDraftNow();
          }
          setIsOnboardingGateModalOpen(true);
          return;
        }

        if (!formData.google_doc_id) {
          setOnboardingState(user.id, {
            step: 'patient',
            patientId,
            patientName: formData.full_name
          });
          if (!id) {
            persistDraftNow();
          }
          await showAlert('Antes de seguir para a evolução, crie ou vincule o prontuário do paciente no Google Docs.', {
            title: "Vincular Prontuário",
            variant: "warning",
            icon: "warning"
          });
          return;
        }

        setOnboardingState(user.id, {
          step: 'evolution',
          patientId,
          patientName: formData.full_name
        });
        void trackLifecycleEvent('onboarding_step_completed', {
          metadata: { step: 'patient', mode: onboardingState?.mode || 'guided', has_google_doc: true },
          dedupeKey: `onboarding_step_completed:${user.id}:patient`,
        });
        clearCurrentDraft();
        pendingPatientIdRef.current = null;
        navigate(`/painel/patients/${patientId}/evolutions/new?onboarding=1`);
      } else {
        clearCurrentDraft();
        pendingPatientIdRef.current = null;
        navigate('/painel/patients');
      }
    } catch (error: any) {
      if (uploadedPhotoPath) {
        try {
          await removePatientPhoto(uploadedPhotoPath);
        } catch (cleanupError) {
          console.warn('[PatientForm] Não foi possível limpar o upload sem cadastro:', cleanupError);
        }
      }
      console.error("Error saving patient:", error);
      if (isOnboardingMode) {
        const errorCode = classifyOnboardingError(error, 'patient_save_failed');
        void trackLifecycleEvent('onboarding_step_error', {
          metadata: { step: 'patient', source: 'patient_save', error_code: errorCode },
          dedupeKey: `onboarding_step_error:${user.id}:patient:save:${errorCode}:${new Date().toISOString().slice(0, 10)}`,
        });
      }
      await showAlert("Erro ao salvar paciente: " + (error?.message || error), {
        title: "Erro ao Salvar",
        variant: "danger",
        icon: "warning"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCancelForm = () => {
    clearCurrentDraft();
    pendingPatientIdRef.current = null;
    navigate(isOnboardingMode ? '/onboarding' : '/painel/patients');
  };

  return (
    <div className="w-full space-y-6">
      <PanelPageHeader
        icon={FileText}
        title={id ? 'Editar Paciente' : 'Novo Paciente'}
        description={id ? 'Atualize os dados cadastrais e as preferências do paciente.' : 'Cadastre as informações necessárias para iniciar o acompanhamento.'}
        titleActions={id ? (
          <PatientEditGuideButton
            expanded={guideOpen}
            onOpen={() => setGuideOpen(true)}
          />
        ) : undefined}
        actions={isOnboardingMode || id ? (
          <div className="flex items-center gap-2">
            {isOnboardingMode && (
              <button
                type="button"
                onClick={() => void handleExitOnboarding()}
                disabled={isExitingOnboarding}
                aria-label="Sair do onboarding"
                className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <X size={14} aria-hidden="true" />
                <span>{isExitingOnboarding ? 'Saindo...' : 'Sair do onboarding'}</span>
              </button>
            )}
            {id && (
              <span className="sm:hidden">
                <PatientEditGuideButton
                  compact
                  expanded={guideOpen}
                  onOpen={() => setGuideOpen(true)}
                />
              </span>
            )}
          </div>
        ) : undefined}
      />

      <form onSubmit={handleSubmit} className="card space-y-8 p-4 sm:p-6">
        <div className="flex min-h-5 items-center justify-end border-b border-brand-border/50 pb-3" aria-live="polite">
          {draftReady && (
            <span className={`text-[11px] font-medium ${draftSaveStatus === 'error' ? 'text-amber-700' : 'text-brand-text-muted'}`}>
              {draftSaveStatus === 'saving' && 'Salvando rascunho...'}
              {draftSaveStatus === 'saved' && 'Rascunho salvo automaticamente'}
              {draftSaveStatus === 'error' && 'Não foi possível salvar o rascunho local'}
            </span>
          )}
        </div>

        <PatientFormSection icon={UserRound} title="Identificação do paciente" description="Dados principais para identificar o paciente no prontuário.">
        <div>
          <label className="block text-sm font-medium text-brand-text mb-1">Nome Completo</label>
          <input
            type="text"
            required
            value={formData.full_name}
            onChange={e => setFormData({...formData, full_name: e.target.value})}
            className="input-field p-2"
          />
        </div>

        <div className="space-y-3">
          <label className="block text-sm font-medium text-brand-text">
            Foto do Paciente <span className="text-brand-text-muted font-normal text-xs">(opcional)</span>
          </label>
          <div className="flex flex-col gap-4 rounded-2xl border border-brand-border/70 bg-brand-bg/30 p-4 sm:flex-row sm:items-center">
            <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white bg-brand-primary/10 text-brand-primary shadow-sm">
              {photoPreviewUrl ? (
                <img src={photoPreviewUrl} alt="Prévia da foto do paciente" className="h-full w-full object-cover" />
              ) : (
                <UserRound size={44} aria-hidden="true" />
              )}
            </div>

            <div className="flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-brand-primary/95">
                  {preparingPhoto ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  <span>{preparingPhoto ? 'Preparando foto...' : photoPreviewUrl ? 'Trocar foto' : 'Adicionar foto'}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp"
                    onChange={(event) => void handlePhotoSelection(event)}
                    disabled={loading || preparingPhoto}
                    className="hidden"
                  />
                </label>
                {photoPreviewUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!photoEditorUrl) setPhotoEditorUrl(photoPreviewUrl);
                      setShowPhotoEditor((visible) => !visible);
                    }}
                    disabled={loading || preparingPhoto}
                    className="inline-flex items-center gap-2 rounded-xl border border-brand-primary/20 bg-white px-4 py-2.5 text-xs font-semibold text-brand-primary hover:bg-brand-primary/5 disabled:opacity-60"
                  >
                    <Crop size={14} /> {showPhotoEditor ? 'Fechar ajuste' : 'Ajustar foto'}
                  </button>
                )}
                {(photoPreviewUrl || photoPath) && (
                  <button
                    type="button"
                    onClick={handleRemovePatientPhoto}
                    disabled={loading || preparingPhoto}
                    className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-60"
                  >
                    <Trash2 size={14} /> Remover
                  </button>
                )}
              </div>
              <p className="text-[10px] leading-relaxed text-brand-text-muted">
                Formatos PNG, JPG ou WEBP, até 10 MB. A prévia é criada automaticamente; use “Ajustar foto” se quiser mudar o enquadramento.
              </p>
            </div>
          </div>

          {showPhotoEditor && photoEditorUrl && (
            <ImageCropEditor
              imageUrl={photoEditorUrl}
              title="Enquadramento da foto"
              description="Arraste a imagem e ajuste a aproximação antes de aplicar o corte."
              imageAlt="Editor de recorte da foto do paciente"
              initialAspect={1}
              aspectOptions={[{ value: 1, label: 'Quadrado 1:1' }]}
              outputWidth={600}
              maxPreviewClassName="max-w-md"
              onApply={handleApplyPatientPhotoCrop}
              onError={(error) => showAlert(`Erro ao ajustar a foto: ${error instanceof Error ? error.message : error}`, { title: 'Erro no Ajuste', variant: 'danger', icon: 'warning' })}
              applying={loading || preparingPhoto}
            />
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-brand-text mb-1">
            Data de Nascimento <span className="text-brand-text-muted font-normal text-xs">(opcional)</span>
          </label>
          <input
            type="date"
            value={formData.birth_date}
            onChange={e => setFormData({...formData, birth_date: e.target.value})}
            className="input-field p-2"
            max={new Date().toISOString().split('T')[0]}
          />
          <p className="text-xs text-brand-text-muted mt-1">
            Usada para lembrar aniversários no painel principal.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-brand-text mb-1">
            CPF <span className="text-brand-text-muted font-normal text-xs">(opcional)</span>
          </label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="000.000.000-00"
            value={formData.cpf}
            onChange={e => setFormData({ ...formData, cpf: formatCpf(e.target.value) })}
            className="input-field p-2"
            maxLength={14}
          />
        </div>

        </PatientFormSection>

        <PatientFormSection icon={Phone} title="Contato" description="Dados destinados ao contato com o paciente.">
        <div>
          <label className="block text-sm font-medium text-brand-text mb-1">
            Telefone / WhatsApp <span className="text-brand-text-muted font-normal text-xs">(opcional)</span>
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={phoneCountry}
              onChange={e => {
                const nextCountry = e.target.value as CountryCode;
                setPhoneCountry(nextCountry);
                setFormData((current) => ({
                  ...current,
                  phone: formatWhatsAppNationalNumber(current.phone, nextCountry),
                }));
              }}
              aria-label="País e DDI do telefone do paciente"
              title="Selecionar país e DDI"
              className="input-field min-w-0 cursor-pointer border border-brand-border bg-white p-2 text-sm outline-none sm:w-64 sm:flex-none"
            >
              {PATIENT_PHONE_COUNTRY_OPTIONS.map(country => (
                <option key={country.code} value={country.code}>
                  {country.flag} {country.name} (+{country.callingCode})
                </option>
              ))}
            </select>
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder={phoneCountry === 'BR' ? '(99) 99999-9999' : 'Número do telefone'}
              value={formData.phone}
              onChange={e => setFormData({
                ...formData,
                phone: formatWhatsAppNationalNumber(e.target.value, phoneCountry),
              })}
              className="input-field min-w-0 flex-grow p-2"
              maxLength={30}
            />
          </div>
          <p className="text-xs text-brand-text-muted mt-1">
            Usado para enviar mensagens rápidas de aniversário via WhatsApp.
          </p>
        </div>
        <p className="text-[11px] text-brand-text-muted">Os dados desta seção são destinados ao contato com o paciente.</p>
        </PatientFormSection>

        <PatientFormSection icon={MapPin} title="Endereço" description="O CEP ajuda a preencher os dados automaticamente. Todos os campos continuam editáveis.">
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-brand-text">CEP <span className="text-brand-text-muted font-normal text-xs">(opcional)</span></label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  placeholder="00000-000"
                  value={formData.postal_code}
                  onChange={(event) => {
                    const postal_code = formatPostalCode(event.target.value);
                    if (postal_code.replace(/\D/g, '') !== lastLookedUpPostalCodeRef.current) setPostalCodeLookupState('idle');
                    setFormData((current) => ({ ...current, postal_code }));
                    if (isCompletePostalCode(postal_code)) void lookupPostalCode(postal_code);
                  }}
                  onBlur={(event) => void lookupPostalCode(event.target.value)}
                  className="input-field p-2 sm:max-w-xs"
                  maxLength={9}
                />
                {postalCodeLookupState === 'loading' && <span className="absolute inset-y-0 left-44 flex items-center gap-1 text-xs text-brand-text-muted"><Loader2 size={13} className="animate-spin" /> Buscando endereço...</span>}
              </div>
              {postalCodeLookupState === 'not-found' && <p className="mt-1 text-xs text-amber-700">CEP não encontrado. Confira o número ou preencha o endereço manualmente.</p>}
              {postalCodeLookupState === 'error' && <p className="mt-1 text-xs text-amber-700">Não foi possível localizar este CEP. Você pode preencher o endereço manualmente.</p>}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
              <label className="text-sm font-medium text-brand-text">Logradouro<input type="text" autoComplete="street-address" value={formData.street} onChange={(e) => setFormData({ ...formData, street: e.target.value })} className="input-field mt-1 p-2" /></label>
              <label className="text-sm font-medium text-brand-text">Número<input type="text" autoComplete="address-line2" value={formData.address_number} onChange={(e) => setFormData({ ...formData, address_number: e.target.value })} className="input-field mt-1 p-2" /></label>
            </div>
            <label className="text-sm font-medium text-brand-text">Complemento <span className="text-brand-text-muted font-normal text-xs">(opcional)</span><input type="text" value={formData.address_complement} onChange={(e) => setFormData({ ...formData, address_complement: e.target.value })} className="input-field mt-1 p-2" /></label>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_100px]">
              <label className="text-sm font-medium text-brand-text">Bairro<input type="text" autoComplete="address-level3" value={formData.neighborhood} onChange={(e) => setFormData({ ...formData, neighborhood: e.target.value })} className="input-field mt-1 p-2" /></label>
              <label className="text-sm font-medium text-brand-text">Cidade<input type="text" autoComplete="address-level2" value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} className="input-field mt-1 p-2" /></label>
              <label className="text-sm font-medium text-brand-text">UF<input type="text" autoComplete="address-level1" maxLength={2} value={formData.state} onChange={(e) => setFormData({ ...formData, state: e.target.value.toUpperCase().slice(0, 2) })} className="input-field mt-1 p-2" /></label>
            </div>
            <p className="text-[11px] leading-relaxed text-brand-text-muted">Precisa registrar outras informações sobre o paciente? Histórico, queixas, antecedentes e demais informações relevantes para o acompanhamento podem ser registrados na Anamnese.</p>
          </div>
        </PatientFormSection>

        <PatientFormSection icon={CalendarClock} title="Sessões e lembretes" description="Configure os dias, horários e lembretes relacionados às sessões do paciente.">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-medium text-brand-text">Dia da semana e Horário da sessão ou das sessões</h3>
            <p className="mt-1 text-xs text-brand-text-muted">
              Configure a agenda recorrente deste paciente. Você pode adicionar vários dias e horários.
            </p>
          </div>

          <div className="space-y-3">
            {formData.session_schedule.length === 0 ? (
              <div className="rounded-xl border border-dashed border-brand-border bg-brand-bg/40 p-4 text-sm text-brand-text-muted">
                Nenhum dia e horário configurado.
              </div>
            ) : (
              formData.session_schedule.map((slot, index) => (
                <div key={index} className="grid grid-cols-1 gap-2 rounded-xl border border-brand-border/70 bg-white p-3 sm:grid-cols-[1fr_140px_auto] sm:items-end">
                  <label className="text-xs font-semibold text-brand-text">
                    Dia da semana
                    <select
                      value={slot.weekday}
                      onChange={(event) => {
                        const weekday = Number(event.target.value);
                        setFormData((prev) => ({
                          ...prev,
                          session_schedule: prev.session_schedule.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, weekday } : item
                          )
                        }));
                      }}
                      className="input-field mt-1 p-2"
                    >
                      {PATIENT_SESSION_WEEKDAYS.map((day) => (
                        <option key={day.value} value={day.value}>{day.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className="text-xs font-semibold text-brand-text">
                    Horário
                    <input
                      type="time"
                      value={slot.time}
                      onChange={(event) => {
                        const time = event.target.value;
                        setFormData((prev) => ({
                          ...prev,
                          session_schedule: prev.session_schedule.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, time } : item
                          )
                        }));
                      }}
                      className="input-field mt-1 p-2"
                    />
                  </label>

                  <button
                    type="button"
                    aria-label="Remover dia e horário"
                    onClick={() => setFormData((prev) => ({
                      ...prev,
                      session_schedule: prev.session_schedule.filter((_, itemIndex) => itemIndex !== index)
                    }))}
                    className="mb-0.5 rounded-xl border border-red-200 p-2.5 text-red-600 transition-colors hover:bg-red-50"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              ))
            )}

            <button
              type="button"
              onClick={() => setFormData((prev) => ({
                ...prev,
                session_schedule: [...prev.session_schedule, { weekday: 1, time: '' }]
              }))}
              className="btn-outline"
            >
              <Plus size={16} />
              <span>Adicionar dia e horário</span>
            </button>
          </div>

          <div className="border-t border-brand-border/60 pt-4 space-y-3">
            <label className="flex items-center space-x-2 text-sm text-brand-text cursor-pointer">
              <input
                type="checkbox"
                checked={formData.evolution_reminder_active}
                onChange={e => setFormData({ ...formData, evolution_reminder_active: e.target.checked })}
                className="h-4 w-4 rounded border-brand-border text-brand-primary focus:ring-brand-primary"
              />
              <span className="font-medium">Ativar lembretes de evolução</span>
            </label>

            {formData.evolution_reminder_active && (
              <div className="rounded-xl border border-brand-primary/15 bg-brand-primary/5 p-4">
                <label className="block text-sm font-medium text-brand-text">
                  Lembrar quantas horas após a sessão?
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={168}
                      step={1}
                      value={formData.evolution_reminder_delay_hours}
                      onChange={(event) => setFormData({
                        ...formData,
                        evolution_reminder_delay_hours: Math.max(0, Math.min(168, Number(event.target.value || 0)))
                      })}
                      className="input-field w-28 p-2"
                    />
                    <span className="text-sm text-brand-text-muted">hora(s) após o horário configurado</span>
                  </div>
                </label>
                <p className="mt-2 text-xs text-brand-text-muted">
                  O lembrete só será enviado se ainda não houver evolução correspondente à sessão.
                </p>
              </div>
            )}

            {formData.evolution_reminder_active && (
              <button
                type="button"
                onClick={handleSendTestReminder}
                className="inline-flex items-center justify-center px-4 py-2 border border-brand-primary/30 text-brand-primary bg-white hover:bg-brand-primary/5 text-sm font-medium rounded-xl transition-all duration-200 cursor-pointer"
              >
                <span>Enviar Lembrete de Teste</span>
              </button>
            )}
          </div>
        </div>
        </PatientFormSection>

        <PatientFormSection
          icon={FolderOpen}
          title="Prontuário e Google Drive"
          description="Vincule ou crie o prontuário do paciente no Google Drive para concluir o cadastro."
          required
          attention={googleSetupAttention}
          sectionRef={googleSetupSectionRef}
        >
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-brand-border/70 bg-brand-bg/60 px-3 py-2.5 text-xs" role="status" aria-live="polite">
            <span className={formData.target_folder_id ? 'font-semibold text-brand-primary' : 'text-brand-text-muted'}>
              {formData.target_folder_id ? '✓' : '1.'} Pasta do Google Drive{formData.target_folder_id ? ' definida' : ''}
            </span>
            <ChevronRight size={14} className="hidden text-brand-text-muted sm:block" aria-hidden={true} />
            <span className={formData.google_doc_id ? 'font-semibold text-brand-primary' : 'text-brand-text-muted'}>
              {formData.google_doc_id ? '✓' : '2.'} Prontuário{formData.google_doc_id ? ' vinculado' : ''}
            </span>
          </div>
          <h3 className="text-lg font-medium text-brand-text mb-4">Prontuário no Google Docs</h3>
          
          {formData.google_doc_id ? (
            <div className="flex items-center justify-between p-4 bg-brand-primary/5 rounded-xl border border-brand-primary/20">
              <div className="flex items-center space-x-3">
                <FileText className="text-brand-primary" />
                <div>
                  <p className="font-medium text-brand-text">{formData.google_doc_name}</p>
                  <a href={formData.google_doc_url} target="_blank" rel="noopener noreferrer" className="text-sm text-brand-primary hover:text-brand-primary-hover hover:underline flex items-center mt-1">
                    <LinkIcon size={14} className="mr-1" /> Abrir documento
                  </a>
                </div>
              </div>
              <button
                type="button"
                data-google-document-control
                onClick={handlePicker}
                className="btn-outline px-3 py-1.5 text-xs"
              >
                Trocar
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {!hasClinicalAccess ? (
                <button
                  type="button"
                  data-google-folder-control
                  onClick={handleReauthenticate}
                  disabled={isReauthenticating}
                  className="col-span-1 md:col-span-2 flex items-center justify-center space-x-2 p-6 bg-yellow-50 border-2 border-yellow-200 border-dashed rounded-xl text-yellow-700 hover:bg-yellow-100 transition-colors"
                >
                  {isReauthenticating ? (
                    <Loader2 size={24} className="animate-spin" />
                  ) : (
                    <Plus size={24} />
                  )}
                  <div className="text-left">
                    <p className="font-bold">
                      {hasGoogleSession ? 'Autorizar acesso ao Drive' : 'Conectar com o Google'}
                    </p>
                    <p className="text-xs">
                      {hasGoogleSession
                        ? 'Sua conta Google já está conectada. Clique para liberar o acesso ao Drive e criar o prontuário.'
                        : 'Clique aqui para conectar sua conta Google e liberar o acesso ao Drive.'}
                    </p>
                  </div>
                </button>
              ) : (
                <>
                  <div className="col-span-1 md:col-span-2 space-y-2 mb-2">
                    <label className="block text-xs font-semibold text-brand-text-muted uppercase tracking-wider">
                      Onde salvar o novo arquivo?
                    </label>
                    {formData.target_folder_id ? (
                      <div className="flex items-center justify-between p-3 bg-brand-bg border border-brand-border rounded-xl">
                        <div className="flex items-center space-x-2 text-sm text-brand-text">
                          <FolderOpen size={16} className="text-brand-primary" />
                          <span className="font-medium truncate max-w-[200px]">{formData.target_folder_name}</span>
                        </div>
                        <button 
                          type="button"
                          data-google-folder-control
                          onClick={() => {
                            setFormData(prev => ({ ...prev, target_folder_id: '', target_folder_name: '' }));
                            clearGoogleFolderPreference(user?.id);
                          }}
                          className="text-brand-text-muted hover:text-red-500 transition-colors"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : showLinkFolder ? (
                      <div className="space-y-3 p-4 bg-brand-bg border border-brand-border rounded-xl">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-brand-text">Vincular pasta pelo link do Drive</p>
                          <button
                            type="button"
                            onClick={() => { setShowLinkFolder(false); setLinkFolderUrl(''); setLinkFolderName(''); }}
                            className="p-1 hover:bg-red-50 hover:text-red-500 rounded-full transition-colors text-brand-text-muted"
                          >
                            <X size={16} />
                          </button>
                        </div>

                        {/* Banner de ajuda destacado */}
                        <button
                          type="button"
                          onClick={() => setShowLinkFolderHelp(true)}
                          className="w-full flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-xl transition-all text-left group"
                        >
                          <span className="text-xl flex-shrink-0">🤔</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-amber-800">Não sabe onde encontrar o link?</p>
                            <p className="text-xs text-amber-700 leading-snug">Clique aqui e veja o passo a passo para copiar o link da pasta do Google Drive.</p>
                          </div>
                          <HelpCircle size={16} className="text-amber-500 flex-shrink-0 group-hover:scale-110 transition-transform" />
                        </button>

                        <div>
                          <label className="block text-xs font-medium text-brand-text-muted mb-1">URL da pasta (copie do Google Drive)</label>
                          <input
                            type="text"
                            value={linkFolderUrl}
                            onChange={e => setLinkFolderUrl(e.target.value)}
                            placeholder="https://drive.google.com/drive/folders/..."
                            className="w-full input-field text-sm p-2"
                            autoFocus
                          />
                          <p className="text-xs text-brand-text-muted mt-1">
                            Abra a pasta no Google Drive, copie a URL da barra de endereço e cole aqui.
                          </p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-brand-text-muted mb-1">Nome da pasta (para identificação)</label>
                          <input
                            type="text"
                            value={linkFolderName}
                            onChange={e => setLinkFolderName(e.target.value)}
                            placeholder="Ex: Pacientes, Prontuários..."
                            className="w-full input-field text-sm p-2"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleConfirmLinkFolder}
                          disabled={!linkFolderUrl.trim()}
                          className="w-full btn-primary text-sm py-2 disabled:opacity-50"
                        >
                          Confirmar vínculo
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          data-google-folder-control
                          onClick={() => openExplorer('folder')}
                          className="w-full flex items-center justify-center space-x-2 p-4 bg-white border-2 border-dashed border-brand-border rounded-xl text-brand-text-muted hover:border-brand-primary hover:text-brand-primary transition-all group"
                        >
                          <FolderOpen size={24} className="group-hover:scale-110 transition-transform" />
                          <div className="text-left">
                            <p className="font-bold">Selecionar ou Criar Pasta</p>
                            <p className="text-xs">Pastas criadas pelo app aparecem aqui.</p>
                          </div>
                        </button>
                        <button
                          type="button"
                          data-google-folder-control
                          onClick={() => setShowLinkFolder(true)}
                          className="w-full flex items-center justify-center space-x-2 p-3 bg-white border border-brand-border rounded-xl text-brand-text-muted hover:border-brand-primary hover:text-brand-primary transition-all group text-sm"
                        >
                          <LinkIcon size={18} className="group-hover:scale-110 transition-transform" />
                          <div className="text-left">
                            <p className="font-semibold">Vincular pasta existente pelo link</p>
                            <p className="text-xs">Já tem uma pasta no Drive? Cole o link aqui.</p>
                          </div>
                        </button>
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    data-google-document-control
                    onClick={handleCreateDoc}
                    disabled={creatingDoc || !formData.full_name}
                    className="flex items-center justify-center space-x-2 p-4 border-2 border-brand-primary border-dashed rounded-xl text-brand-primary hover:bg-brand-primary/5 transition-colors disabled:opacity-50"
                  >
                    {creatingDoc ? (
                      <Loader2 size={24} className="animate-spin" />
                    ) : (
                      <Plus size={24} />
                    )}
                    <span className="font-medium">Criar novo prontuário</span>
                  </button>

                  <button
                    type="button"
                    data-google-document-control
                    onClick={handlePicker}
                    className="flex items-center justify-center space-x-2 p-4 border-2 border-dashed border-brand-border rounded-xl text-brand-text-muted hover:border-brand-primary hover:text-brand-primary transition-colors bg-brand-bg/50 hover:bg-brand-primary/5"
                  >
                    <FileText size={24} />
                    <span className="font-medium">Selecionar existente</span>
                  </button>
                </>
              )}
            </div>
          )}
          <p className="text-xs text-brand-text-muted mt-2">
            {!formData.full_name && !formData.google_doc_id ? (
              <span className="text-red-500">Preencha o nome do paciente para liberar a criação do prontuário.</span>
            ) : !hasClinicalAccess ? (
              <span className="text-yellow-600">
                {hasGoogleSession
                  ? 'Sua conta Google já está conectada, mas ainda falta autorizar o acesso ao Drive para criar o prontuário.'
                  : 'Conecte sua conta Google para acessar o Drive e criar o prontuário.'}
              </span>
            ) : (
              formData.target_folder_id 
                ? `O novo prontuário será criado dentro da pasta "${formData.target_folder_name}".`
                : "Selecione uma pasta de destino para organizar seus prontuários."
            )}
          </p>
        </div>
        </PatientFormSection>

        <PatientFormSection icon={StickyNote} title="Informações adicionais">
          <div>
            <label className="block text-sm font-medium text-brand-text mb-1">Observações</label>
            <textarea
              rows={4}
              value={formData.notes}
              onChange={e => setFormData({...formData, notes: e.target.value})}
              className="input-field p-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-brand-text mb-1">Template de Evolução Padrão</label>
            <select
              value={formData.default_template_id}
              onChange={e => setFormData({...formData, default_template_id: e.target.value})}
              className="input-field p-2"
            >
              <option value="">Sem template padrão (Formatação Geral)</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setIsTemplateHelpOpen(true)}
              className="mt-1.5 text-xs text-brand-primary hover:text-brand-primary-hover hover:underline flex items-center gap-1 font-medium bg-transparent border-0 cursor-pointer p-0"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              Não sabe qual escolher? Ver diferenças dos templates
            </button>
            <p className="text-xs text-brand-text-muted mt-1.5">Define o formato metodológico clínico padrão para as evoluções deste paciente (ex: SOAP, ABA, TCC).</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-brand-text mb-1">Status</label>
            <select
              value={formData.status}
              onChange={e => setFormData({...formData, status: e.target.value as 'active' | 'inactive'})}
              className="input-field p-2"
            >
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
          </div>
        </PatientFormSection>

        {/* Custom Folder Explorer Modal */}
        {showExplorer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-primary/20 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[600px] max-h-[85vh] border border-brand-border animate-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="p-4 border-b border-brand-border flex items-center justify-between bg-brand-bg/50">
                <div className="flex items-center space-x-2 text-brand-primary font-bold">
                  <FolderOpen size={20} />
                  <span>{explorerMode === 'folder' ? 'Selecionar Pasta de Destino' : 'Selecionar Prontuário Existente'}</span>
                </div>
                <button type="button" onClick={() => setShowExplorer(false)} className="p-1 hover:bg-red-50 hover:text-red-500 rounded-full transition-colors">
                  <X size={24} />
                </button>
              </div>

              {/* Breadcrumbs */}
              <div className="px-4 py-2 bg-white border-b border-brand-border flex items-center space-x-1 overflow-x-auto whitespace-nowrap text-sm scrollbar-hide">
                {explorerPath.map((item, index) => (
                  <React.Fragment key={item.id}>
                    {index > 0 && <ChevronRight size={14} className="text-brand-text-muted flex-shrink-0" />}
                    <button
                      type="button"
                      onClick={() => handleNavigateUp(index)}
                      className={`hover:text-brand-primary transition-colors flex items-center space-x-1 ${index === explorerPath.length - 1 ? 'font-bold text-brand-text' : 'text-brand-text-muted'}`}
                    >
                      {index === 0 && <Home size={14} />}
                      <span>{item.name}</span>
                    </button>
                  </React.Fragment>
                ))}
              </div>

              {/* Privacy Badge */}
              <div className="px-4 py-2.5 bg-brand-primary/5 border-b border-brand-border/60 flex items-center space-x-2 text-xs text-brand-primary">
                <ShieldCheck size={16} className="flex-shrink-0" />
                <span>
                  <strong>Privacidade garantida:</strong> O aplicativo só acessa pastas e prontuários criados por ele mesmo. Seus arquivos pessoais permanecem 100% seguros e inacessíveis.
                </span>
              </div>

              {/* Toolbar */}
              <div className="p-3 bg-brand-bg/30 flex flex-col space-y-3 border-b border-brand-border">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCreateNewFolder}
                      disabled={isCreatingFolder}
                      className="flex items-center space-x-2 px-4 py-2 bg-white border border-brand-primary/20 rounded-xl text-brand-primary hover:bg-brand-primary/5 transition-all text-sm font-bold shadow-sm"
                    >
                      {isCreatingFolder ? <Loader2 size={16} className="animate-spin" /> : <FolderPlus size={16} />}
                      <span className="hidden sm:inline">Criar Pasta</span>
                      <span className="sm:hidden">Criar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const current = explorerPath[explorerPath.length - 1];
                        loadExplorerFolders(current.id, undefined, explorerSearch, isGlobalSearch);
                      }}
                      disabled={isLoadingExplorer}
                      className="p-2 bg-white border border-brand-border rounded-xl text-brand-text-muted hover:text-brand-primary transition-all shadow-sm"
                      title="Atualizar lista"
                    >
                      <RefreshCw size={18} className={isLoadingExplorer ? 'animate-spin' : ''} />
                    </button>
                  </div>
                  <div className="flex items-center space-x-2">
                    <label className="flex items-center space-x-1 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={isGlobalSearch}
                        onChange={(e) => setIsGlobalSearch(e.target.checked)}
                        className="rounded border-brand-border text-brand-primary focus:ring-brand-primary"
                      />
                      <span className="text-xs text-brand-text-muted">Busca Global</span>
                    </label>
                  </div>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-muted" size={18} />
                  <input
                    type="text"
                    value={explorerSearch}
                    onChange={(e) => setExplorerSearch(e.target.value)}
                    placeholder={isGlobalSearch ? "Pesquisar em todo o Drive..." : "Pesquisar nesta pasta..."}
                    className="w-full pl-10 pr-4 py-2 bg-white border border-brand-border rounded-xl focus:ring-2 focus:ring-brand-primary focus:border-brand-primary outline-none text-sm transition-all shadow-inner"
                  />
                  {explorerSearch && (
                    <button
                      type="button"
                      onClick={() => setExplorerSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-text-muted hover:text-brand-primary"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              </div>

              {/* Folder List */}
              <div className="flex-grow overflow-y-auto p-2">
                {isLoadingExplorer ? (
                  <div className="flex flex-col items-center justify-center h-64 text-brand-text-muted space-y-4">
                    <Loader2 size={40} className="animate-spin text-brand-primary" />
                    <p className="animate-pulse">Acessando pastas do Google...</p>
                  </div>
                ) : explorerFolders.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-2">
                    {explorerFolders.map(item => {
                      const isFolder = item.mimeType === 'application/vnd.google-apps.folder';
                      const isSelectableFile = explorerMode === 'file' && item.mimeType === 'application/vnd.google-apps.document';
                      
                      return (
                        <button
                          type="button"
                          key={item.id}
                          onClick={() => handleSelectItem(item)}
                          className={`flex items-center space-x-3 p-4 bg-white border rounded-xl transition-all text-left group relative
                            ${isFolder ? 'border-brand-border hover:border-brand-primary hover:bg-brand-primary/5' : ''}
                            ${isSelectableFile ? 'border-brand-primary/30 hover:border-brand-primary hover:bg-brand-primary/5 shadow-sm' : 'border-dashed border-brand-border/40 opacity-70'}
                          `}
                          disabled={!isFolder && !isSelectableFile}
                        >
                          <div className={`p-2 rounded-lg transition-colors
                            ${isFolder ? 'bg-brand-primary/10 text-brand-primary group-hover:bg-brand-primary group-hover:text-white' : 'bg-brand-bg text-brand-text-muted group-hover:bg-brand-primary group-hover:text-white'}
                          `}>
                            {isFolder ? <Folder size={20} /> : <FileText size={20} />}
                          </div>
                          <div className="grow truncate">
                            <p className={`font-medium truncate ${isFolder ? 'text-brand-text' : 'text-brand-text-muted group-hover:text-brand-text'}`}>
                              {item.name}
                            </p>
                            <p className="text-[10px] uppercase tracking-wider text-brand-text-muted mt-0.5">
                              {isFolder ? 'Pasta' : 'Documento'}
                            </p>
                          </div>
                          
                          <div className="flex items-center space-x-1">
                            <button
                              type="button"
                              onClick={(e) => handleDeleteFolder(e, item.id, item.name)}
                              className="p-2 text-brand-text-muted hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                              title="Excluir"
                            >
                              <Trash2 size={16} />
                            </button>
                            {isFolder && <ChevronRight size={16} className="text-brand-text-muted group-hover:translate-x-1 transition-transform" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center min-h-[300px] text-brand-text-muted space-y-4 px-8 py-6 text-center">
                    <FolderOpen className="opacity-20 text-brand-primary" size={56} />
                    <div className="max-w-md space-y-1">
                      <p className="font-bold text-brand-text">Nenhuma subpasta encontrada</p>
                      <p className="text-sm leading-relaxed">
                        O explorador mostra apenas pastas criadas por este app. Crie uma nova pasta ou use a opção <strong>"Vincular pelo link"</strong> para conectar uma pasta já existente no seu Drive.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setShowExplorer(false); setShowLinkFolder(true); }}
                      className="flex items-center space-x-2 px-4 py-2.5 bg-brand-primary/10 border border-brand-primary/30 rounded-xl text-brand-primary hover:bg-brand-primary/20 transition-all text-sm font-semibold"
                    >
                      <LinkIcon size={16} />
                      <span>Vincular pasta existente pelo link</span>
                    </button>
                    <div className="pt-4 border-t border-brand-border w-full max-w-xs">
                      <p className="text-xs mb-2">Ou crie uma nova pasta neste local:</p>
                      <button
                        type="button"
                        onClick={handleExplorerReauthenticate}
                        className="btn-outline text-xs py-2 w-full justify-center"
                      >
                        {isReauthenticating ? <Loader2 size={14} className="animate-spin mr-2" /> : <RefreshCw size={14} className="mr-2" />}
                        Sincronizar Google Drive
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer Actions */}
              <div className="p-4 bg-white border-t border-brand-border flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowExplorer(false)}
                  className="btn-outline border-brand-border"
                >
                  Cancelar
                </button>
                  <button
                    type="button"
                    onClick={handleSelectCurrentFolder}
                    disabled={explorerMode !== 'folder'}
                    className={`btn-primary min-w-[200px] ${explorerMode !== 'folder' ? 'opacity-0 pointer-events-none' : ''}`}
                  >
                    Selecionar esta pasta
                  </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-6 border-t border-brand-border">
          <div />
          <div className="flex space-x-3 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={handleCancelForm}
              className="btn-outline"
            >
              {isOnboardingMode ? 'Voltar' : 'Cancelar'}
            </button>
            <button
              type="submit"
              disabled={loading || preparingPhoto}
              className="btn-primary"
            >
              {preparingPhoto ? 'Preparando foto...' : loading ? 'Salvando...' : 'Salvar Paciente'}
            </button>
          </div>
        </div>
      </form>

      <GoogleSecurityModal
        isOpen={isSecurityModalOpen}
        onClose={() => setIsSecurityModalOpen(false)}
        onConfirm={executeGoogleReauthentication}
        confirmLabel="Autorizar acesso"
        mode="clinical"
      />

      <GoogleSecurityModal
        isOpen={isOnboardingGateModalOpen}
        onClose={() => setIsOnboardingGateModalOpen(false)}
        onConfirm={executeGoogleReauthentication}
        confirmLabel="Autorizar acesso ao Google"
        mode="onboarding"
        showCloseButton={false}
      />

      <GooglePermissionRecoveryModal
        isOpen={isGooglePermissionModalOpen}
        onClose={() => setIsGooglePermissionModalOpen(false)}
        onReview={() => void executeGoogleReauthentication(true)}
        isLoading={isReauthenticating}
      />


      <TemplateExplanationModal
        isOpen={isTemplateHelpOpen}
        onClose={() => setIsTemplateHelpOpen(false)}
      />

      {/* Modal de ajuda: como obter o link da pasta no Google Drive */}
      {showLinkFolderHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-brand-border animate-in zoom-in-95 duration-200">

            {/* Header */}
            <div className="p-5 border-b border-brand-border flex items-center justify-between bg-brand-primary/5">
              <div className="flex items-center gap-2 text-brand-primary font-bold">
                <HelpCircle size={20} />
                <span>Como obter o link da pasta</span>
              </div>
              <button
                type="button"
                onClick={() => setShowLinkFolderHelp(false)}
                className="p-1.5 hover:bg-red-50 hover:text-red-500 rounded-full transition-colors text-brand-text-muted"
              >
                <X size={20} />
              </button>
            </div>

            {/* Seletor de plataforma */}
            <div className="px-5 pt-4">
              <p className="text-xs text-brand-text-muted mb-3">Como você vai acessar o Google Drive agora?</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setLinkFolderHelpTab('browser')}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-sm font-semibold transition-all ${
                    linkFolderHelpTab === 'browser'
                      ? 'bg-brand-primary text-white border-brand-primary shadow-sm'
                      : 'bg-white text-brand-text-muted border-brand-border hover:border-brand-primary hover:text-brand-primary'
                  }`}
                >
                  <span className="text-base">💻</span>
                  Pelo navegador
                </button>
                <button
                  type="button"
                  onClick={() => setLinkFolderHelpTab('mobile')}
                  className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-sm font-semibold transition-all ${
                    linkFolderHelpTab === 'mobile'
                      ? 'bg-brand-primary text-white border-brand-primary shadow-sm'
                      : 'bg-white text-brand-text-muted border-brand-border hover:border-brand-primary hover:text-brand-primary'
                  }`}
                >
                  <span className="text-base">📱</span>
                  Pelo app mobile
                </button>
              </div>
            </div>

            {/* Body — instruções por plataforma */}
            <div className="p-5 space-y-4 max-h-[55vh] overflow-y-auto">

              {linkFolderHelpTab === 'browser' ? (
                <>
                  <p className="text-xs text-brand-text-muted leading-relaxed">
                    Siga os passos no <strong>Google Drive pelo navegador</strong> (computador ou celular):
                  </p>
                  <ol className="space-y-4">
                    {[
                      {
                        step: 1,
                        icon: '🌐',
                        title: 'Acesse o Google Drive',
                        desc: 'Abra drive.google.com no navegador e faça login com a conta Google vinculada ao app.',
                      },
                      {
                        step: 2,
                        icon: '📂',
                        title: 'Navegue até a pasta',
                        desc: 'Encontre e clique na pasta que contém os prontuários do paciente para abri-la.',
                      },
                      {
                        step: 3,
                        icon: '🔗',
                        title: 'Copie a URL da barra de endereço',
                        desc: 'Com a pasta aberta, clique na barra de endereço do navegador, selecione tudo (Ctrl+A) e copie (Ctrl+C). O link terá o formato:',
                        extra: 'https://drive.google.com/drive/folders/...',
                      },
                      {
                        step: 4,
                        icon: '✅',
                        title: 'Cole aqui no app',
                        desc: 'Volte para este formulário, cole o link no campo "URL da pasta" e clique em Confirmar vínculo.',
                      },
                    ].map(({ step, icon, title, desc, extra }) => (
                      <li key={step} className="flex gap-3">
                        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-brand-primary text-white text-xs font-bold flex items-center justify-center mt-0.5">
                          {step}
                        </span>
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-brand-text">{icon} {title}</p>
                          <p className="text-xs text-brand-text-muted leading-relaxed">{desc}</p>
                          {extra && (
                            <p className="text-xs font-mono bg-brand-bg border border-brand-border rounded-lg px-2.5 py-1.5 text-brand-primary break-all">
                              {extra}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                  <div className="pt-2 border-t border-brand-border">
                    <a
                      href="https://drive.google.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary font-semibold text-sm rounded-xl transition-colors"
                    >
                      <FolderOpen size={16} />
                      Abrir Google Drive em nova aba
                    </a>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs text-brand-text-muted leading-relaxed">
                    Siga os passos no <strong>aplicativo Google Drive</strong> instalado no celular:
                  </p>
                  <ol className="space-y-4">
                    {[
                      {
                        step: 1,
                        icon: '📱',
                        title: 'Abra o app Google Drive',
                        desc: 'Abra o aplicativo Google Drive no seu celular. Se não tiver instalado, baixe gratuitamente na App Store ou Google Play.',
                      },
                      {
                        step: 2,
                        icon: '📂',
                        title: 'Encontre e abra a pasta',
                        desc: 'Navegue até a pasta que contém os prontuários do paciente e toque nela para abri-la.',
                      },
                      {
                        step: 3,
                        icon: '⋮',
                        title: 'Toque nos três pontos (⋮) da pasta',
                        desc: 'Com a pasta aberta, toque no ícone de três pontos (⋮) no canto superior direito — ou mantenha o dedo pressionado sobre o nome da pasta na listagem.',
                      },
                      {
                        step: 4,
                        icon: '🔗',
                        title: 'Selecione "Copiar link"',
                        desc: 'No menu que abrir, toque em "Copiar link". O link da pasta será copiado para a área de transferência do celular. Ele terá o formato:',
                        extra: 'https://drive.google.com/drive/folders/...',
                      },
                      {
                        step: 5,
                        icon: '✅',
                        title: 'Cole aqui no app',
                        desc: 'Volte para este formulário, toque no campo "URL da pasta", cole o link (pressione e segure → Colar) e toque em Confirmar vínculo.',
                      },
                    ].map(({ step, icon, title, desc, extra }) => (
                      <li key={step} className="flex gap-3">
                        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-brand-primary text-white text-xs font-bold flex items-center justify-center mt-0.5">
                          {step}
                        </span>
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-brand-text">{icon} {title}</p>
                          <p className="text-xs text-brand-text-muted leading-relaxed">{desc}</p>
                          {extra && (
                            <p className="text-xs font-mono bg-brand-bg border border-brand-border rounded-lg px-2.5 py-1.5 text-brand-primary break-all">
                              {extra}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                  <div className="pt-2 border-t border-brand-border">
                    <p className="text-xs text-brand-text-muted text-center">
                      💡 Dica: se o link copiado começar com <span className="font-mono text-brand-primary">https://drive.google.com/drive/folders/</span> está correto!
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 pb-5">
              <button
                type="button"
                onClick={() => setShowLinkFolderHelp(false)}
                className="w-full btn-primary py-2.5"
              >
                Entendi, vou copiar o link
              </button>
            </div>
          </div>
        </div>
      )}

      {id && (
        <FeatureGuideModal
          open={guideOpen}
          onClose={() => setGuideOpen(false)}
          eyebrow="Edição do paciente"
          title="Como funciona a edição do paciente"
          description="Siga este fluxo para manter os dados cadastrais, a agenda e o prontuário do paciente organizados."
          steps={PATIENT_EDIT_GUIDE_STEPS}
          note="Revise os dados antes de salvar. A edição atualiza o cadastro do paciente, sem apagar o histórico clínico já registrado."
          supportHref={PATIENT_EDIT_SUPPORT_HREF}
        />
      )}
    </div>

  );
}
