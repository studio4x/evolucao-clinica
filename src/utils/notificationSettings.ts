const WHATSAPP_SECRET_KEYS = [
  "whatsapp_access_token",
  "whatsapp_app_secret",
  "whatsapp_phone_number_id",
  "whatsapp_webhook_verify_token",
  "whatsapp_test_number"
] as const;

export function stripStoredWhatsAppConfiguration(
  settings: Record<string, unknown>
): Record<string, unknown> {
  const sanitized = { ...settings };
  for (const key of WHATSAPP_SECRET_KEYS) {
    delete sanitized[key];
  }
  return sanitized;
}

export function mergeNotificationSettings(
  current: Record<string, unknown>,
  updates: Record<string, unknown>
): Record<string, unknown> {
  return stripStoredWhatsAppConfiguration({
    ...current,
    ...updates
  });
}
