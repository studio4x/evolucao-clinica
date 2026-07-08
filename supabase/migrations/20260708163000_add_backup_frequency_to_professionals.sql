-- Adiciona coluna backup_frequency na tabela professionals
ALTER TABLE public.professionals 
ADD COLUMN IF NOT EXISTS backup_frequency TEXT DEFAULT 'monthly';
