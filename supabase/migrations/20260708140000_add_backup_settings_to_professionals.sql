-- Adiciona colunas para configuração de backup automático na tabela public.professionals
ALTER TABLE public.professionals 
ADD COLUMN IF NOT EXISTS auto_backup_enabled BOOLEAN DEFAULT false;

ALTER TABLE public.professionals 
ADD COLUMN IF NOT EXISTS last_backup_at TIMESTAMP WITH TIME ZONE;
