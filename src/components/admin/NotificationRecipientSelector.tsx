import React, { useMemo, useState } from 'react';
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
  enableProfessionalSearch?: boolean;
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
  enableProfessionalSearch = false,
}: NotificationRecipientSelectorProps) {
  const [professionalSearch, setProfessionalSearch] = useState('');
  const selectedStage = funnelBoard?.stages.find((stage) => stage.key === selectedFunnelStage);
  const recipientCount = getNotificationRecipientCount({
    target,
    professionals,
    specificProfessionalId: selectedProfessionalId,
    selectedFunnelStage,
    funnelBoard,
  });

  const phoneByProfessionalId = useMemo(
    () => new Map((funnelBoard?.professionals || []).map((professional) => [
      professional.id,
      String(professional.whatsappNumber || '').trim(),
    ])),
    [funnelBoard]
  );

  const filteredProfessionals = useMemo(() => {
    if (!enableProfessionalSearch) return professionals;
    const query = professionalSearch.trim().toLowerCase();
    if (!query) return professionals;

    const digits = query.replace(/\D/g, '');
    return professionals.filter((professional) => {
      if (professional.id === selectedProfessionalId) return true;
      const name = String(professional.full_name || '').toLowerCase();
      const email = String(professional.google_email || '').toLowerCase();
      const phone = phoneByProfessionalId.get(professional.id) || '';
      return name.includes(query)
        || email.includes(query)
        || (digits.length > 0 && phone.replace(/\D/g, '').includes(digits));
    });
  }, [enableProfessionalSearch, phoneByProfessionalId, professionalSearch, professionals, selectedProfessionalId]);

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
        <div className="space-y-2">
          {enableProfessionalSearch && (
            <div className="space-y-1">
              <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">Pesquisar Profissional</label>
              <input
                type="search"
                value={professionalSearch}
                onChange={(event) => setProfessionalSearch(event.target.value)}
                placeholder="Nome, e-mail ou telefone"
                autoComplete="off"
                className="w-full px-3.5 py-2.5 border border-brand-border rounded-xl text-sm outline-none focus:border-brand-primary bg-brand-bg/40 font-medium"
              />
              <p className="text-[10px] text-brand-text-muted">
                {filteredProfessionals.length} profissional{filteredProfessionals.length === 1 ? '' : 'is'} encontrado{filteredProfessionals.length === 1 ? '' : 's'}.
              </p>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">Selecionar Profissional</label>
            <select
              value={selectedProfessionalId}
              onChange={(event) => onProfessionalChange(event.target.value)}
              required
              className="w-full px-3.5 py-2.5 border border-brand-border rounded-xl text-sm outline-none focus:border-brand-primary bg-brand-bg/40 font-medium"
            >
              <option value="">-- Escolha o Profissional --</option>
              {filteredProfessionals.length === 0 && (
                <option value="" disabled>Nenhum profissional encontrado</option>
              )}
              {filteredProfessionals.map((professional) => {
                const phone = phoneByProfessionalId.get(professional.id);
                return (
                  <option key={professional.id} value={professional.id}>
                    {professional.full_name} ({professional.google_email || 'Sem e-mail'}{phone ? ` • ${phone}` : ''})
                  </option>
                );
              })}
            </select>
          </div>
        </div>
      )}

      <p className="text-xs font-medium text-brand-text-muted">
        {target === 'funnel_stage' && funnelLoading ? 'Os destinatários serão atualizados quando o funil terminar de carregar.' : recipientLabel(recipientCount)}
      </p>
    </div>
  );
}
