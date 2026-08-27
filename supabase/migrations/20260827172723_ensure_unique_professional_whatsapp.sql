DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.communication_preferences
    WHERE whatsapp_number IS NOT NULL
    GROUP BY whatsapp_number
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Existem numeros de WhatsApp duplicados em communication_preferences.'
      USING ERRCODE = '23505';
  END IF;
END;
$$;

ALTER TABLE public.communication_preferences
  ADD CONSTRAINT communication_preferences_whatsapp_number_format_check
  CHECK (whatsapp_number IS NULL OR whatsapp_number ~ '^[0-9]{8,15}$');

DROP INDEX IF EXISTS public.communication_preferences_whatsapp_number_lookup_idx;

CREATE UNIQUE INDEX communication_preferences_whatsapp_number_unique_idx
  ON public.communication_preferences (whatsapp_number)
  WHERE whatsapp_number IS NOT NULL;

COMMENT ON INDEX public.communication_preferences_whatsapp_number_unique_idx IS
  'Impede que o mesmo numero canonico de WhatsApp seja associado a mais de um profissional.';
