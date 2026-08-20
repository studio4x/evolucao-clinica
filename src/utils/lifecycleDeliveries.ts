export type LifecycleDeliveryGroup = {
  professionalId: string;
  recipientName: string;
  recipientEmail: string;
  deliveries: any[];
  latestAt: string | null;
};

const deliveryTimestamp = (delivery: any) => {
  const value = delivery.sent_at || delivery.scheduled_for || delivery.created_at;
  const time = value ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
};

export function groupLifecycleDeliveries(deliveries: any[]): LifecycleDeliveryGroup[] {
  const grouped = new Map<string, LifecycleDeliveryGroup>();

  for (const delivery of deliveries || []) {
    const professionalId = String(delivery.user_id || delivery.recipient_email || delivery.recipient_name || delivery.id || 'unknown');
    const current = grouped.get(professionalId);
    if (current) {
      current.deliveries.push(delivery);
      if (deliveryTimestamp(delivery) > deliveryTimestamp({ sent_at: current.latestAt })) {
        current.latestAt = delivery.sent_at || delivery.scheduled_for || delivery.created_at || current.latestAt;
      }
      continue;
    }

    grouped.set(professionalId, {
      professionalId,
      recipientName: delivery.recipient_name || 'Usuário não identificado',
      recipientEmail: delivery.recipient_email || 'E-mail não identificado',
      deliveries: [delivery],
      latestAt: delivery.sent_at || delivery.scheduled_for || delivery.created_at || null
    });
  }

  return [...grouped.values()]
    .map((group) => ({
      ...group,
      deliveries: [...group.deliveries].sort((a, b) => deliveryTimestamp(b) - deliveryTimestamp(a))
    }))
    .sort((a, b) => {
      const latestDifference = deliveryTimestamp({ sent_at: b.latestAt }) - deliveryTimestamp({ sent_at: a.latestAt });
      if (latestDifference !== 0) return latestDifference;
      return a.recipientName.localeCompare(b.recipientName, 'pt-BR', { sensitivity: 'base' });
    });
}

export function paginateLifecycleDeliveryGroups(
  groups: LifecycleDeliveryGroup[],
  page: number,
  pageSize = 10
) {
  const safePageSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(groups.length / safePageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * safePageSize;

  return {
    page: safePage,
    pageSize: safePageSize,
    total: groups.length,
    totalPages,
    groups: groups.slice(start, start + safePageSize)
  };
}
