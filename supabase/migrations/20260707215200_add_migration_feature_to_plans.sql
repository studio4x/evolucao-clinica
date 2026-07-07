-- Remove a funcionalidade de migração do Plano Mensal (se houver) e adiciona ao Plano Anual
UPDATE public.plans 
SET features = ARRAY[
  'Pacientes ilimitados',
  'Evoluções clínicas com IA ilimitadas',
  'Integração com Google Docs em tempo real',
  'Gravação e transcrição de áudio nativa',
  'Geração de Relatórios & PDI por IA',
  'Pesquisa Inteligente por IA (Pergunte ao Prontuário)',
  'Assinatura Digital de Documentos com Proteção Legal',
  'Compartilhamento Seguro de Relatórios (WhatsApp/E-mail)',
  'Filtro de Período na Impressão do Prontuário',
  'Lembrete e envio de WhatsApp para aniversariantes',
  'Impressão de prontuários do Google Docs'
]
WHERE id = 'monthly';

UPDATE public.plans 
SET features = ARRAY[
  'Tudo do plano mensal',
  'Desconto de ~17% sobre o valor mensal',
  'Suporte prioritário via ticket',
  'Garantia de novos recursos exclusivos em primeira mão',
  'Migração assistida de prontuários por IA (PDF/Word/Excel)'
]
WHERE id = 'yearly';
