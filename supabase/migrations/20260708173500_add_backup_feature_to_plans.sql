-- Adiciona a funcionalidade de backup e restauração nas funcionalidades do Plano Anual na tabela de planos
UPDATE public.plans 
SET features = ARRAY[
  'Tudo do plano mensal',
  'Desconto de ~17% sobre o valor mensal',
  'Suporte prioritário via ticket',
  'Garantia de novos recursos exclusivos em primeira mão',
  'Migração assistida de prontuários por IA (PDF/Word/Excel)',
  'Logotipo personalizado nos relatórios e evoluções (PDF/Impresso)',
  'Backup e Restauração completa de dados no Google Drive (Diário/Semanal/Mensal)'
]
WHERE id = 'yearly';
