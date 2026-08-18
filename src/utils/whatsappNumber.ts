export class RequiredWhatsAppNumberError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RequiredWhatsAppNumberError';
  }
}

export function normalizeRequiredWhatsAppNumber(value: string): string {
  const normalized = String(value || '').replace(/\D/g, '');
  if (!normalized) {
    throw new RequiredWhatsAppNumberError('Informe seu número de WhatsApp para continuar.');
  }
  if (normalized.length < 8 || normalized.length > 15) {
    throw new RequiredWhatsAppNumberError('Informe o WhatsApp com DDI, DDD e número. Exemplo: 5511999887766.');
  }
  return normalized;
}
