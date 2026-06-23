-- Adiciona coluna de data de nascimento na tabela patients
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS birth_date DATE DEFAULT NULL;

COMMENT ON COLUMN public.patients.birth_date IS
  'Data de nascimento do paciente, usada para exibir lembretes de aniversario no dashboard';
