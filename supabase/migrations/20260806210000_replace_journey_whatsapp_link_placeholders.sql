-- Replace the operational placeholders before the Journey messages are claimed
-- by the WhatsApp worker. The replacements are idempotent.
UPDATE public.journey_contents
SET whatsapp_message = replace(
  replace(
    whatsapp_message,
    '[LINK DA CENTRAL GERAL]',
    'https://www.evolucaoclinica.app.br/jornada/jornada-15-dias'
  ),
  '[LINK DO GRUPO DE DÚVIDAS]',
  'https://chat.whatsapp.com/LQul6zmyTRn1C9izuLiYUI'
)
WHERE whatsapp_message LIKE '%[LINK DA CENTRAL GERAL]%'
   OR whatsapp_message LIKE '%[LINK DO GRUPO DE DÚVIDAS]%';
