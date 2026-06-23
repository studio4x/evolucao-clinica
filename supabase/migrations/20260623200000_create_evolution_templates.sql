-- Migration: Create Evolution Templates Table and seed default templates
-- Target: Supabase PostgreSQL Database

-- 1. Create table for templates
CREATE TABLE IF NOT EXISTS public.evolution_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    system_prompt_instruction TEXT NOT NULL,
    professional_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Enable RLS on evolution_templates
ALTER TABLE public.evolution_templates ENABLE ROW LEVEL SECURITY;

-- 2. Create RLS Policies
-- Allow anyone authenticated to read system templates (professional_id IS NULL) or their own custom templates
CREATE POLICY select_templates ON public.evolution_templates
    FOR SELECT
    TO authenticated
    USING (professional_id IS NULL OR professional_id = auth.uid());

-- Allow users to insert/update/delete their own templates
CREATE POLICY insert_templates ON public.evolution_templates
    FOR INSERT
    TO authenticated
    WITH CHECK (professional_id = auth.uid());

CREATE POLICY update_templates ON public.evolution_templates
    FOR UPDATE
    TO authenticated
    USING (professional_id = auth.uid())
    WITH CHECK (professional_id = auth.uid());

CREATE POLICY delete_templates ON public.evolution_templates
    FOR DELETE
    TO authenticated
    USING (professional_id = auth.uid());

-- 3. Seed Default Templates (Deterministic static UUIDs)
INSERT INTO public.evolution_templates (id, name, description, system_prompt_instruction, professional_id)
VALUES
(
    '00000000-0000-0000-0000-000000000001',
    'Modelo SOAP (Geral / Fisioterapia / Fonoaudiologia)',
    'Subjetivo, Objetivo, Avaliação e Plano. O padrão ouro da evolução clínica.',
    'Transcreva o áudio organizando rigorosamente na estrutura SOAP:\n\n**S - Subjetivo:** Detalhe os relatos, queixas, humor e estado geral trazidos pelo paciente ou pelo acompanhante.\n**O - Objetivo:** Descreva detalhadamente os dados observáveis, testes, exercícios aplicados, desempenho físico e suporte físico/verbal dado pelo terapeuta.\n**A - Avaliação:** Faça uma análise clínica do progresso do dia, nível de engajamento, regulação e resposta à intervenção.\n**P - Plano:** Defina os próximos passos do tratamento, tarefas para casa ou recomendações para as próximas sessões.\n\nSe alguma dessas informações não estiver presente no áudio, preencha o respectivo campo com "[Informação não relatada no áudio]". Não invente dados.',
    NULL
),
(
    '00000000-0000-0000-0000-000000000002',
    'Modelo ABA (Autismo / Terapia Comportamental)',
    'Antecedente, Comportamento, Consequência, Níveis de Prompts e Barreiras.',
    'Transcreva o áudio organizando a evolução no padrão ABA (Applied Behavior Analysis):\n\n**Antecedentes (Estímulo):** Descreva as demandas, estímulos ou instruções dadas ao paciente.\n**Comportamentos Observados:** Descreva as ações observáveis do paciente, reações físicas e respostas comportamentais.\n**Consequências Aplicadas:** Detalhe as reações do terapeuta, reforços aplicados ou manejos de comportamento.\n**Nível de Suporte (Prompts):** Identifique o nível de ajuda necessário (Independente, Verbal, Gestual, Físico Parcial ou Físico Total).\n**Comportamentos de Barreira / Estereotipias:** Registre qualquer comportamento de fuga, agressividade, autoestimulação ou barreira ao aprendizado.\n\nSe alguma dessas informações não estiver presente no áudio, preencha o respectivo campo com "[Informação não relatada no áudio]". Não invente dados.',
    NULL
),
(
    '00000000-0000-0000-0000-000000000003',
    'Modelo TCC (Terapia Cognitivo-Comportamental)',
    'Humor atual, Pensamentos Automáticos, Crenças, Intervenções e Tarefas.',
    'Transcreva o áudio organizando a evolução clínica no formato de Terapia Cognitivo-Comportamental (TCC):\n\n**Humor e Estado Atual:** Detalhe o relato do paciente sobre suas emoções e estado de humor recente.\n**Pensamentos Automáticos e Distorções Cognitivas:** Identifique pensamentos automáticos disfuncionais ou distorções trazidas pelo paciente durante o relato.\n**Crenças Nucleares / Esquemas:** Descreva crenças subjacentes ou esquemas identificados na sessão.\n**Intervenções Terapêuticas Realizadas:** Detalhe as técnicas aplicadas (ex: questionamento socrático, reestruturação cognitiva, registro de pensamentos).\n**Tarefa de Casa (Plano de Ação):** Registre os combinados práticas e tarefas acordadas para a semana.\n\nSe alguma dessas informações não estiver presente no áudio, preencha o respectivo campo com "[Informação não relatada no áudio]". Não invente dados.',
    NULL
),
(
    '00000000-0000-0000-0000-000000000004',
    'Modelo Terapia Ocupacional (TO)',
    'Desempenho Ocupacional, AVDs, Integração Sensorial e Coordenação.',
    'Transcreva o áudio organizando na estrutura da Terapia Ocupacional:\n\n**Áreas de Desempenho Ocupacional (AVD / AIVD):** Descreva o desempenho em atividades de vida diária, brincar, estudo ou trabalho.\n**Integração e Regulação Sensorial:** Detalhe as respostas sensoriais do paciente (hipo/hiper-reatividade) e nível de regulação.\n**Coordenação Motora e Praxia:** Registre aspectos de coordenação motora fina, grossa, planejamento motor e tônus.\n**Comportamento e Aspectos Socioemocionais:** Descreva a postura, engajamento com a atividade e autorregulação durante as tarefas.\n**Orientações e Conduta:** Próximos focos e recomendações/adaptações ambientais para a casa/escola.\n\nSe alguma dessas informações não estiver presente no áudio, preencha o respectivo campo com "[Informação não relatada no áudio]". Não invente dados.',
    NULL
),
(
    '00000000-0000-0000-0000-000000000005',
    'Modelo Fonoaudiologia',
    'Linguagem, Voz, Motricidade Orofacial, Audição e Recomendações.',
    'Transcreva o áudio organizando na estrutura da Fonoaudiologia:\n\n**Aspectos Fonoaudiológicos Avaliados/Trabalhados:** Descreva o foco (Linguagem Oral/Escrita, Fala, Voz, Audição, Motricidade Orofacial ou Deglutição).\n**Desempenho e Resposta do Paciente:** Registre as produções, acertos, correções, dificuldades e evolução do paciente nas tarefas propostas.\n**Estratégias, Pistas e Recursos Utilizados:** Descreva as técnicas (pistas visuais, auditivas, táteis) e materiais empregados pelo terapeuta.\n**Orientação para Família e Conduta:** Exercícios recomendados para fixação no ambiente familiar e planejamento da conduta terapêutica.\n\nSe alguma dessas informações não estiver presente no áudio, preencha o respectivo campo com "[Informação não relatada no áudio]". Não invente dados.',
    NULL
),
(
    '00000000-0000-0000-0000-000000000006',
    'Modelo Narrativo / Psicanálise (Livre)',
    'Conteúdo Manifesto (Relato Livre), Conteúdo Latente (Análise) e Transferência.',
    'Transcreva o áudio organizando na estrutura da clínica psicanalítica/narrativa:\n\n**Conteúdo Manifesto (Associação Livre):** Resuma as temáticas principais trazidas pelo analisando de forma manifesta durante a sessão.\n**Análise e Conteúdo Latente:** Registre as interpretações do analista sobre defesas, atos falhos, silêncios, sonhos e significantes marcantes.\n**Dinâmica Transferencial / Contratransferencial:** Anote as percepções do vínculo estabelecido e projeções verificadas na sessão.\n\nSe alguma dessas informações não estiver presente no áudio, preencha o respectivo campo com "[Informação não relatada no áudio]". Não invente dados.',
    NULL
)
ON CONFLICT (id) DO UPDATE 
SET name = EXCLUDED.name, 
    description = EXCLUDED.description, 
    system_prompt_instruction = EXCLUDED.system_prompt_instruction;

-- 4. Alter patients table to add default_template_id link
ALTER TABLE public.patients 
ADD COLUMN IF NOT EXISTS default_template_id UUID REFERENCES public.evolution_templates(id) ON DELETE SET NULL;

-- 5. Alter evolutions table to add template_id link
ALTER TABLE public.evolutions 
ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.evolution_templates(id) ON DELETE SET NULL;
