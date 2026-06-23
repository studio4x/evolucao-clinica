import React from 'react';
import { SupportTicketStatus } from '../../services/support';

interface TicketStatusBadgeProps {
  status: SupportTicketStatus;
}

export default function TicketStatusBadge({ status }: TicketStatusBadgeProps) {
  let badgeStyles = 'bg-gray-100 text-gray-800 border-gray-200';
  let label = 'Desconhecido';

  switch (status) {
    case 'open':
      badgeStyles = 'bg-blue-50 text-blue-700 border-blue-200';
      label = 'Aberto';
      break;
    case 'in_progress':
      badgeStyles = 'bg-amber-50 text-amber-700 border-amber-200';
      label = 'Em atendimento';
      break;
    case 'closed':
      badgeStyles = 'bg-emerald-50 text-emerald-700 border-emerald-200';
      label = 'Fechado';
      break;
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${badgeStyles}`}>
      <span className="w-1.5 h-1.5 mr-1.5 rounded-full bg-current"></span>
      {label}
    </span>
  );
}
