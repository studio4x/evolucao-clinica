-- Criação da tabela de categorias de FAQ
CREATE TABLE IF NOT EXISTS public.faq_categories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Criação da tabela de perguntas e respostas de FAQ
CREATE TABLE IF NOT EXISTS public.faq_questions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    category_id UUID REFERENCES public.faq_categories(id) ON DELETE CASCADE NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice de display_order e categorias
CREATE INDEX IF NOT EXISTS idx_faq_categories_order ON public.faq_categories(display_order);
CREATE INDEX IF NOT EXISTS idx_faq_questions_order ON public.faq_questions(display_order);
CREATE INDEX IF NOT EXISTS idx_faq_questions_category ON public.faq_questions(category_id);

-- Habilitar RLS (Row Level Security) nas duas tabelas
ALTER TABLE public.faq_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faq_questions ENABLE ROW LEVEL SECURITY;

-- Políticas de RLS para faq_categories
DROP POLICY IF EXISTS "Allow authenticated users to read FAQ categories" ON public.faq_categories;
CREATE POLICY "Allow authenticated users to read FAQ categories" 
    ON public.faq_categories FOR SELECT 
    TO authenticated 
    USING (true);

DROP POLICY IF EXISTS "Allow admins to write FAQ categories" ON public.faq_categories;
CREATE POLICY "Allow admins to write FAQ categories" 
    ON public.faq_categories FOR ALL 
    TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM public.professionals 
            WHERE id = auth.uid() AND role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.professionals 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Políticas de RLS para faq_questions
DROP POLICY IF EXISTS "Allow authenticated users to read FAQ questions" ON public.faq_questions;
CREATE POLICY "Allow authenticated users to read FAQ questions" 
    ON public.faq_questions FOR SELECT 
    TO authenticated 
    USING (true);

DROP POLICY IF EXISTS "Allow admins to write FAQ questions" ON public.faq_questions;
CREATE POLICY "Allow admins to write FAQ questions" 
    ON public.faq_questions FOR ALL 
    TO authenticated 
    USING (
        EXISTS (
            SELECT 1 FROM public.professionals 
            WHERE id = auth.uid() AND role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.professionals 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Inserir as categorias de FAQ padrão
INSERT INTO public.faq_categories (id, name, display_order) VALUES
('b1100000-0000-0000-0000-000000000001', 'Primeiros Passos', 1),
('b1100000-0000-0000-0000-000000000002', 'Inteligência Artificial', 2),
('b1100000-0000-0000-0000-000000000003', 'Google Docs & Sincronização', 3),
('b1100000-0000-0000-0000-000000000004', 'Assinatura Digital & Segurança', 4),
('b1100000-0000-0000-0000-000000000005', 'Planos & Assinaturas', 5)
ON CONFLICT (name) DO UPDATE SET display_order = EXCLUDED.display_order;

-- Inserir as perguntas e respostas iniciais
INSERT INTO public.faq_questions (category_id, question, answer, display_order) VALUES
(
  'b1100000-0000-0000-0000-000000000001', 
  'Como funciona o aplicativo Evolução Clínica?', 
  'O aplicativo transcreve relatos em áudio gravados por você e os transforma em evoluções clínicas estruturadas e padronizadas. Em seguida, insere essa evolução automaticamente no prontuário do paciente no seu Google Docs em tempo real. Isso economiza horas de digitação e mantém seus registros organizados.',
  1
),
(
  'b1100000-0000-0000-0000-000000000001', 
  'Posso usar o aplicativo no celular?', 
  'Sim! O aplicativo é um PWA (Progressive Web App) e pode ser instalado no seu celular Android ou iPhone como se fosse um aplicativo nativo. Basta acessar o site pelo navegador do seu celular e clicar no botão "Instalar Aplicativo" no menu lateral para fixá-lo na tela inicial.',
  2
),
(
  'b1100000-0000-0000-0000-000000000002', 
  'Como a IA transcreve e estrutura os áudios clínicos?', 
  'Nós utilizamos a tecnologia avançada do Google Gemini. Ela foi treinada para compreender jargões técnicos da área de saúde, psicologia, terapia ocupacional e fonoaudiologia. A IA remove repetições, hesitações e vícios de fala, entregando uma evolução estruturada no padrão clínico em segundos.',
  1
),
(
  'b1100000-0000-0000-0000-000000000002', 
  'O que é a Pesquisa Inteligente no Histórico?', 
  'É uma funcionalidade que permite fazer perguntas em linguagem natural ao prontuário do paciente. Em vez de abrir e ler manualmente todas as evoluções clínicas antigas para achar uma informação (ex: "Quando o paciente começou a usar a pinça trípode?"), você digita a pergunta e a IA busca nas evoluções arquivadas e resume a resposta com as datas e fontes exatas.',
  2
),
(
  'b1100000-0000-0000-0000-000000000003', 
  'Por que preciso conceder permissão ao Google Docs?', 
  'Para garantir máxima privacidade, o aplicativo não armazena os prontuários dos seus pacientes nos nossos servidores; seus dados ficam salvos de forma segura no seu próprio Google Drive. Por isso, precisamos da sua permissão para ler e escrever no arquivo correspondente a cada paciente no seu Drive.',
  1
),
(
  'b1100000-0000-0000-0000-000000000003', 
  'Como vinculo um paciente a um documento do Google Docs?', 
  'Ao cadastrar ou editar um paciente, você verá um botão para vincular ou criar um documento no Google Docs. Se escolher criar, o app criará uma pasta no seu Google Drive com um documento formatado com cabeçalho clínico para aquele paciente, mantendo a sincronização ativa.',
  2
),
(
  'b1100000-0000-0000-0000-000000000004', 
  'O que é a Assinatura Digital de Documentos com Proteção Legal?', 
  'É um recurso de conformidade jurídica. Quando você termina uma evolução clínica ou gera um relatório, pode assiná-lo digitalmente no painel. O sistema registra a data/hora oficial do servidor, o seu IP de conexão e calcula uma chave digital. A partir desse momento, o documento fica trancado contra edições ou exclusões, garantindo validade jurídica para auditorias ou convênios.',
  1
),
(
  'b1100000-0000-0000-0000-000000000004', 
  'Os dados dos meus pacientes estão seguros de acordo com a LGPD?', 
  'Com certeza. Além de não armazenarmos os textos dos prontuários em nossos servidores (eles ficam salvos no seu Google Drive), todo o tráfego de dados é criptografado e as APIs de IA não utilizam os seus dados clínicos para treinamento público. Cumprimos rigorosamente os requisitos da Lei Geral de Proteção de Dados.',
  2
),
(
  'b1100000-0000-0000-0000-000000000005', 
  'Como posso gerenciar ou cancelar minha assinatura?', 
  'Você tem total flexibilidade. Basta acessar a aba "Assinatura" no menu lateral do seu painel e gerenciar seu plano. Os pagamentos são processados com total segurança através do Google Pay e Stripe, permitindo cancelamento a qualquer momento sem taxas adicionais.',
  1
)
ON CONFLICT DO NOTHING;
