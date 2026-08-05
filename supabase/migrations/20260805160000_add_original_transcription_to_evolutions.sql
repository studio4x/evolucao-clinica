ALTER TABLE public.evolutions
ADD COLUMN IF NOT EXISTS original_transcription_text text;

COMMENT ON COLUMN public.evolutions.original_transcription_text IS
  'Transcrição original do áudio, anterior à aplicação de qualquer modelo de evolução.';

-- Somente evoluções sem template podem ser recuperadas com segurança. Para
-- registros antigos que já foram formatados por um template, manter NULL evita
-- apresentar o texto formatado como se fosse a narração original.
UPDATE public.evolutions
SET original_transcription_text = transcription_text
WHERE original_transcription_text IS NULL
  AND template_id IS NULL
  AND transcription_text IS NOT NULL;
