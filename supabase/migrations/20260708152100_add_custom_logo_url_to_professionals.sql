-- Adiciona a coluna custom_logo_url na tabela de profissionais para permitir logotipo personalizado
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS custom_logo_url text;

-- Adiciona a funcionalidade de logotipo personalizado nas funcionalidades do Plano Anual na tabela de planos
UPDATE public.plans 
SET features = ARRAY[
  'Tudo do plano mensal',
  'Desconto de ~17% sobre o valor mensal',
  'Suporte prioritário via ticket',
  'Garantia de novos recursos exclusivos em primeira mão',
  'Migração assistida de prontuários por IA (PDF/Word/Excel)',
  'Logotipo personalizado nos relatórios e evoluções (PDF/Impresso)'
]
WHERE id = 'yearly';
