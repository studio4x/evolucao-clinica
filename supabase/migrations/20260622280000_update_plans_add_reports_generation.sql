-- Adiciona a funcionalidade de Geração de Relatórios & PDI por IA no plano mensal
UPDATE public.plans 
SET features = ARRAY[
  'Pacientes ilimitados',
  'Evoluções clínicas com IA ilimitadas',
  'Integração com Google Docs em tempo real',
  'Gravação e transcrição de áudio nativa',
  'Geração de Relatórios & PDI por IA',
  'Lembrete e envio de WhatsApp para aniversariantes',
  'Compartilhamento de relatórios via WhatsApp',
  'Impressão de prontuários do Google Docs'
]
WHERE id = 'monthly';
