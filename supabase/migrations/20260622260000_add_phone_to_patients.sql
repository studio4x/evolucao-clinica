-- Adiciona coluna de telefone na tabela patients
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT NULL;

COMMENT ON COLUMN public.patients.phone IS
  'Telefone do paciente, usado para enviar mensagens via WhatsApp';
