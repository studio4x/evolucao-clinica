const EMAIL_MAX_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

export const WHATSAPP_SHARE_MESSAGE = (link: string) => `Olá! Foi disponibilizado um formulário de Anamnese para preenchimento. Você pode acessá-lo pelo link abaixo:

${link}

Após o preenchimento, as informações serão encaminhadas ao profissional para revisão.`;

export const EMAIL_SHARE_SUBJECT = 'Anamnese para preenchimento';
export const EMAIL_SHARE_BODY = (link: string) => `Olá,

Foi disponibilizado um formulário de Anamnese para preenchimento.

Acesse pelo link abaixo:

${link}

Após o preenchimento, as informações serão encaminhadas ao profissional para revisão.`;

export function normalizePatientEmail(value: unknown): string {
  return String(value || '').trim().toLocaleLowerCase('pt-BR');
}

export function isValidPatientEmail(value: unknown): boolean {
  const normalized = normalizePatientEmail(value);
  return normalized.length <= EMAIL_MAX_LENGTH && (!normalized || EMAIL_PATTERN.test(normalized));
}

export function normalizePatientEmailOrNull(value: unknown): string | null {
  const normalized = normalizePatientEmail(value);
  if (!normalized) return null;
  return isValidPatientEmail(normalized) ? normalized : null;
}

export function normalizeStoredWhatsAppNumber(value: unknown): string | null {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export function buildWhatsAppShareUrl(phone: unknown, link: string): string | null {
  const normalizedPhone = normalizeStoredWhatsAppNumber(phone);
  if (!normalizedPhone) return null;
  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(WHATSAPP_SHARE_MESSAGE(link))}`;
}

export function buildEmailShareUrl(email: unknown, link: string): string | null {
  const normalizedEmail = normalizePatientEmail(email);
  if (!normalizedEmail || !isValidPatientEmail(normalizedEmail)) return null;
  return `mailto:${encodeURIComponent(normalizedEmail)}?subject=${encodeURIComponent(EMAIL_SHARE_SUBJECT)}&body=${encodeURIComponent(EMAIL_SHARE_BODY(link))}`;
}

export async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Fall back to the legacy browser API below.
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('Não foi possível copiar o link.');
}
