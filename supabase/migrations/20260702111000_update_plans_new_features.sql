-- Atualiza a listagem de funcionalidades do Plano Mensal na tabela de planos
UPDATE public.plans 
SET features = ARRAY[
  'Pacientes ilimitados',
  'Evoluções clínicas com IA ilimitadas',
  'Integração com Google Docs em tempo real',
  'Gravação e transcrição de áudio nativa',
  'Geração de Relatórios & PDI por IA',
  'Busca Semântica por IA (Pesquisa Inteligente - RAG)',
  'Assinatura Digital com Validade Jurídica (SHA-256)',
  'Compartilhamento Seguro de Relatórios (WhatsApp/E-mail)',
  'Filtro de Período na Impressão do Prontuário',
  'Lembrete e envio de WhatsApp para aniversariantes',
  'Impressão de prontuários do Google Docs'
]
WHERE id = 'monthly';

-- Atualiza a listagem de funcionalidades do Plano Anual na tabela de planos
UPDATE public.plans
SET features = ARRAY[
  'Tudo do plano mensal',
  'Desconto de ~17% sobre o valor mensal',
  'Suporte prioritário via e-mail e WhatsApp',
  'Garantia de novos recursos exclusivos em primeira mão'
]
WHERE id = 'yearly';
