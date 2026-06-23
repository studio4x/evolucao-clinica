import React from 'react';
import { SupportSlaStatus } from '../../services/support';

interface TicketSlaBadgeProps {
  status: SupportSlaStatus;
}

export default function TicketSlaBadge({ status }: TicketSlaBadgeProps) {
  let badgeStyles = 'bg-gray-50 text-gray-700 border-gray-200';
  let label = 'Em cálculo';

  switch (status) {
    case 'on_time':
      badgeStyles = 'bg-sky-50 text-sky-700 border-sky-200';
      label = 'No prazo';
      break;
    case 'at_risk':
      badgeStyles = 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse';
      label = 'Em risco';
      break;
    case 'overdue':
      badgeStyles = 'bg-red-100 text-red-800 border-red-300 font-bold';
      label = 'Atrasado';
      break;
    case 'answered':
      badgeStyles = 'bg-emerald-50 text-emerald-700 border-emerald-200';
      label = 'Respondido';
      break;
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${badgeStyles}`}>
      {label}
    </span>
  );
}
