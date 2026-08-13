# Release 1.0.80

- Consentimento de GTM, GA4 e Meta Pixel corrigido por finalidade.
- Conversões Stripe passam a reutilizar somente atribuição web real, consentida e persistida.
- Fila idempotente de Measurement Protocol com lock, backoff e worker de recuperação.
- Android/Google Play permanece no fluxo automático do Firebase, sem conversões web inventadas.
