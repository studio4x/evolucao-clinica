-- Corrige a matemática e a descrição de desconto das funcionalidades do Plano Anual na tabela de planos
UPDATE public.plans 
SET 
  discount_text = '57% OFF',
  features = ARRAY[
    'Tudo do plano mensal',
    'Economia de 57% em relação ao plano mensal',
    'Suporte prioritário via ticket',
    'Garantia de novos recursos exclusivos em primeira mão',
    'Migração assistida de prontuários por IA (PDF/Word/Excel)',
    'Logotipo personalizado nos relatórios e evoluções (PDF/Impresso)',
    'Backup e Restauração completa de dados no Google Drive (Diário/Semanal/Mensal)'
  ]
WHERE id = 'yearly';
