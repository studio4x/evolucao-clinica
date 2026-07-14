-- Migration: Create Journey System Tables, RLS, Triggers and Seed Data
-- Target: Supabase PostgreSQL Database

-- 1. Create public.journeys table
CREATE TABLE IF NOT EXISTS public.journeys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    subtitle TEXT,
    description TEXT,
    cover_image_url TEXT,
    total_days INTEGER NOT NULL DEFAULT 15,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'archived')),
    start_date DATE,
    end_date DATE,
    timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    public_url TEXT,
    whatsapp_main_group_url TEXT,
    whatsapp_support_group_url TEXT,
    show_whatsapp_main_group BOOLEAN NOT NULL DEFAULT FALSE,
    show_scheduled_as_coming_soon BOOLEAN NOT NULL DEFAULT TRUE,
    trial_url TEXT,
    website_url TEXT,
    seo_title TEXT,
    seo_description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.professionals(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.professionals(id) ON DELETE SET NULL
);

-- 2. Create public.journey_contents table
CREATE TABLE IF NOT EXISTS public.journey_contents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journey_id UUID NOT NULL REFERENCES public.journeys(id) ON DELETE CASCADE,
    day_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    slug TEXT NOT NULL,
    short_description TEXT,
    content TEXT, -- rich text in markdown
    image_url TEXT,
    image_alt TEXT,
    video_url TEXT,
    video_embed_url TEXT,
    content_type TEXT NOT NULL DEFAULT 'text' CHECK (content_type IN ('text', 'image', 'video', 'mixed')),
    cta_text TEXT,
    cta_url TEXT,
    secondary_cta_text TEXT,
    secondary_cta_url TEXT,
    whatsapp_message TEXT,
    image_prompt TEXT,
    publication_status TEXT NOT NULL DEFAULT 'draft' CHECK (publication_status IN ('draft', 'scheduled', 'published', 'archived')),
    publication_date DATE,
    publication_time TIME,
    published_at TIMESTAMPTZ,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    allow_indexing BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES public.professionals(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES public.professionals(id) ON DELETE SET NULL,
    CONSTRAINT journey_contents_day_unique UNIQUE (journey_id, day_number),
    CONSTRAINT journey_contents_slug_unique UNIQUE (journey_id, slug)
);

-- 3. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_journeys_status ON public.journeys (status);
CREATE INDEX IF NOT EXISTS idx_journeys_slug ON public.journeys (slug);
CREATE INDEX IF NOT EXISTS idx_journey_contents_journey ON public.journey_contents (journey_id);
CREATE INDEX IF NOT EXISTS idx_journey_contents_publication_status ON public.journey_contents (publication_status);
CREATE INDEX IF NOT EXISTS idx_journey_contents_slug ON public.journey_contents (journey_id, slug);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.journeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journey_contents ENABLE ROW LEVEL SECURITY;

-- 5. Triggers for updated_at
DROP TRIGGER IF EXISTS set_journeys_updated_at ON public.journeys;
CREATE TRIGGER set_journeys_updated_at
BEFORE UPDATE ON public.journeys
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_journey_contents_updated_at ON public.journey_contents;
CREATE TRIGGER set_journey_contents_updated_at
BEFORE UPDATE ON public.journey_contents
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- 6. RLS Policies for public.journeys
DROP POLICY IF EXISTS "Allow public read access to active journeys" ON public.journeys;
CREATE POLICY "Allow public read access to active journeys"
ON public.journeys FOR SELECT
USING (status = 'active');

DROP POLICY IF EXISTS "Allow admin full access to journeys" ON public.journeys;
CREATE POLICY "Allow admin full access to journeys"
ON public.journeys FOR ALL
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

-- 7. RLS Policies for public.journey_contents
DROP POLICY IF EXISTS "Allow public read access to active journey contents" ON public.journey_contents;
CREATE POLICY "Allow public read access to active journey contents"
ON public.journey_contents FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.journeys j
        WHERE j.id = journey_id AND j.status = 'active'
    ) AND (publication_status = 'published' OR publication_status = 'scheduled')
);

DROP POLICY IF EXISTS "Allow admin full access to journey contents" ON public.journey_contents;
CREATE POLICY "Allow admin full access to journey contents"
ON public.journey_contents FOR ALL
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

-- 8. Seed Initial Data
-- Insert main journey (draft status)
INSERT INTO public.journeys (id, title, slug, subtitle, description, total_days, status, timezone)
VALUES (
    'a1100000-0000-0000-0000-000000000001',
    'Jornada de 15 dias',
    'jornada-15-dias',
    'Conteúdos e demonstrações do Evolução Clínica',
    'Conheça, em 15 dias, uma forma mais prática de transformar sua fala em registros clínicos organizados.',
    15,
    'draft',
    'America/Sao_Paulo'
)
ON CONFLICT (slug) DO NOTHING;

-- Insert the 15 contents in draft status for this journey
INSERT INTO public.journey_contents (journey_id, day_number, title, slug, content_type, publication_status, sort_order)
VALUES 
('a1100000-0000-0000-0000-000000000001', 1, 'Boas-vindas à Jornada Evolução Clínica', 'boas-vindas', 'text', 'draft', 1),
('a1100000-0000-0000-0000-000000000001', 2, 'A rotina dos registros clínicos', 'rotina-registros-clinicos', 'text', 'draft', 2),
('a1100000-0000-0000-0000-000000000001', 3, 'Conheça o Evolução Clínica', 'conheca-evolucao-clinica', 'text', 'draft', 3),
('a1100000-0000-0000-0000-000000000001', 4, 'Da fala ao prontuário', 'fala-ao-prontuario', 'text', 'draft', 4),
('a1100000-0000-0000-0000-000000000001', 5, 'Gravação e transcrição com IA', 'gravacao-transcricao-ia', 'text', 'draft', 5),
('a1100000-0000-0000-0000-000000000001', 6, 'Como a evolução clínica é estruturada', 'evolucao-clinica-estruturada', 'text', 'draft', 6),
('a1100000-0000-0000-0000-000000000001', 7, 'Menos tempo digitando', 'menos-tempo-digitando', 'text', 'draft', 7),
('a1100000-0000-0000-0000-000000000001', 8, 'Gestão de pacientes e histórico', 'gestao-pacientes-historico', 'text', 'draft', 8),
('a1100000-0000-0000-0000-000000000001', 9, 'Documentos de acompanhamento', 'documentos-acompanhamento', 'text', 'draft', 9),
('a1100000-0000-0000-0000-000000000001', 10, 'A IA organiza, o profissional revisa', 'ia-organiza-profissional-revisa', 'text', 'draft', 10),
('a1100000-0000-0000-0000-000000000001', 11, 'Dúvidas frequentes', 'duvidas-frequentes', 'text', 'draft', 11),
('a1100000-0000-0000-0000-000000000001', 12, 'Uma rotina de uso na prática', 'rotina-uso-pratica', 'text', 'draft', 12),
('a1100000-0000-0000-0000-000000000001', 13, 'Conheça o teste gratuito', 'conheca-teste-gratuito', 'text', 'draft', 13),
('a1100000-0000-0000-0000-000000000001', 14, 'Como aproveitar os sete dias', 'como-aproveitar-sete-dias', 'text', 'draft', 14),
('a1100000-0000-0000-0000-000000000001', 15, 'Recapitulação e convite final', 'recapitulacao-convite-final', 'text', 'draft', 15)
ON CONFLICT (journey_id, day_number) DO NOTHING;
