import type { ProfessionalFunnelStageKey } from '../../server/admin/professionalFunnel';

export type BroadcastTarget = 'all' | 'funnel_stage' | 'specific';

export type NotificationProfessionalOption = {
  id: string;
  full_name: string;
  google_email: string;
};

export type NotificationProfessionalContact = {
  id: string;
  whatsappNumber?: string | null;
};

export type ProfessionalFunnelStageOption = {
  key: ProfessionalFunnelStageKey;
  label: string;
  description: string;
};

export type ProfessionalFunnelRecipient = {
  id: string;
  stage: ProfessionalFunnelStageKey;
  whatsappNumber?: string | null;
};

export type ProfessionalFunnelBoardForNotifications = {
  professionals: ProfessionalFunnelRecipient[];
  stages: ProfessionalFunnelStageOption[];
  stageCounts: Partial<Record<ProfessionalFunnelStageKey, number>>;
  total: number;
};

export type NotificationRecipientResolutionInput = {
  target: BroadcastTarget;
  professionals: NotificationProfessionalOption[];
  specificProfessionalId?: string;
  selectedFunnelStage?: ProfessionalFunnelStageKey | '';
  funnelBoard?: ProfessionalFunnelBoardForNotifications | null;
};

export const isBroadcastTarget = (value: string): value is BroadcastTarget => (
  value === 'all' || value === 'funnel_stage' || value === 'specific'
);

export const resolveFunnelStageRecipients = (
  professionals: ProfessionalFunnelRecipient[],
  selectedFunnelStage: ProfessionalFunnelStageKey
) => professionals.filter((professional) => professional.stage === selectedFunnelStage);

export const getFunnelStageRecipientCount = (
  board: ProfessionalFunnelBoardForNotifications,
  selectedFunnelStage: ProfessionalFunnelStageKey
) => resolveFunnelStageRecipients(board.professionals, selectedFunnelStage).length;

export const resolveNotificationTargets = ({
  target,
  professionals,
  specificProfessionalId,
  selectedFunnelStage,
  funnelBoard,
}: NotificationRecipientResolutionInput): string[] => {
  if (target === 'all') return professionals.map((professional) => professional.id);
  if (target === 'specific') return specificProfessionalId ? [specificProfessionalId] : [];
  if (!selectedFunnelStage || !funnelBoard) return [];
  return resolveFunnelStageRecipients(funnelBoard.professionals, selectedFunnelStage).map((professional) => professional.id);
};

export const getNotificationRecipientCount = ({
  target,
  professionals,
  specificProfessionalId,
  selectedFunnelStage,
  funnelBoard,
}: NotificationRecipientResolutionInput): number => resolveNotificationTargets({
  target,
  professionals,
  specificProfessionalId,
  selectedFunnelStage,
  funnelBoard,
}).length;
