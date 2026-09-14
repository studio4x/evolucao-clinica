import React from 'react';
import {
  getFunnelStageRecipientCount,
  getNotificationRecipientCount,
  isBroadcastTarget,
  type BroadcastTarget,
  type NotificationProfessionalOption,
  type ProfessionalFunnelBoardForNotifications,
} from '../../utils/notificationRecipients';
import type { ProfessionalFunnelStageKey } from '../../../server/admin/professionalFunnel';

type NotificationRecipientSelectorProps = {
  target: BroadcastTarget;
  onTargetChange: (target: BroadcastTarget) => void;
  selectedProfessionalId: string;
  onProfessionalChange: (professionalId: string) => void;
  selectedFunnelStage: ProfessionalFunnelStageKey | '';
  onFunnelStageChange: (stage: ProfessionalFunnelStageKey | '') => void;
  professionals: NotificationProfessionalOption[];
  funnelBoard: ProfessionalFunnelBoardForNotifications | null;
  funnelLoading: boolean;
  funnelError: string;
};

const recipientLabel = (count: number) => `${count} profissional${count === 1 ? '' : 'is'} receberá${count === 1 ? '' : 'ão'} este envio.`;

export default function NotificationRecipientSelector({
  target,
  onTargetChange,
  selectedProfessionalId,
  onProfessionalChange,
  selectedFunnelStage,
  onFunnelStageChange,
  professionals,
  funnelBoard,
  funnelLoading,
  funnelError,
}: NotificationRecipientSelectorProps) {
  const selectedStage = funnelBoard?.stages.find((stage) => stage.key === selectedFunnelStage);
  const recipientCount = getNotificationRecipientCount({
    target,
    professionals,
    specificProfessionalId: selectedProfessionalId,
    selectedFunnelStage,
    funnelBoard,
  });

  const handleTargetChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    if (isBroadcastTarget(event.target.value)) onTargetChange(event.target.value);
  };

  const handleFunnelStageChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const stage = funnelBoard?.stages.find((option) => option.key === event.target.value);
    onFunnelStageChange(stage?.key || '');
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">Destinatário</label>
        <select
          value={target}
          onChange={handleTargetChange}
          className="w-full px-3.5 py-2.5 border border-brand-border rounded-xl text-sm outline-none focus:border-brand-primary bg-brand-bg/40 font-medium"
        >
          <option value="all">Todos os Profissionais (Broadcast)</option>
          <option value="funnel_stage" disabled={funnelLoading || Boolean(funnelError)}>
            Etapa do Funil
          </option>
          <option value="specific">Profissional Específico</option>
        </select>
      </div>

      {target === 'funnel_stage' && (
        <div className="space-y-2 rounded-xl border border-brand-border/70 bg-brand-bg/30 p-3">
          <div className="space-y-1">
            <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">Etapa do Funil</label>
            <select
              value={selectedFunnelStage}
              onChange={handleFunnelStageChange}
              disabled={funnelLoading || Boolean(funnelError) || !funnelBoard}
              className="w-full px-3.5 py-2.5 border border-brand-border rounded-xl text-sm outline-none focus:border-brand-primary bg-brand-bg/40 font-medium disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">
                {funnelLoading ? 'Carregando etapas do funil...' : '— Escolha uma etapa —'}
              </option>
              {funnelBoard?.stages.map((stage) => {
                const count = getFunnelStageRecipientCount(funnelBoard, stage.key);
                return (
                  <option key={stage.key} value={stage.key}>
                    {stage.label} — {count} profissional{count === 1 ? '' : 'is'}
                  </option>
                );
              })}
            </select>
          </div>

          {funnelLoading && <p className="text-xs text-brand-text-muted">Carregando dados atuais do funil...</p>}
          {funnelError && <p className="text-xs text-red-700">{funnelError} O envio por etapa está indisponível; os demais destinatários continuam disponíveis.</p>}
          {selectedStage && (
            <p className="text-xs leading-relaxed text-brand-text-muted">
              <span className="font-semibold text-brand-text">{selectedStage.label}</span>{' — '}{selectedStage.description}
            </p>
          )}
        </div>
      )}

      {target === 'specific' && (
        <div className="space-y-1">
          <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">Selecionar Profissional</label>
          <select
            value={selectedProfessionalId}
            onChange={(event) => onProfessionalChange(event.target.value)}
            required
            className="w-full px-3.5 py-2.5 border border-brand-border rounded-xl text-sm outline-none focus:border-brand-primary bg-brand-bg/40 font-medium"
          >
            <option value="">-- Escolha o Profissional --</option>
            {professionals.map((professional) => (
              <option key={professional.id} value={professional.id}>
                {professional.full_name} ({professional.google_email || 'Sem e-mail'})
              </option>
            ))}
          </select>
        </div>
      )}

      <p className="text-xs font-medium text-brand-text-muted">
        {target === 'funnel_stage' && funnelLoading ? 'Os destinatários serão atualizados quando o funil terminar de carregar.' : recipientLabel(recipientCount)}
      </p>
    </div>
  );
}
