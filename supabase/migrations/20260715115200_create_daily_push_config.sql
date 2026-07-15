-- Migration: Create daily push config default settings row
-- Target: Supabase PostgreSQL Database

-- 1. Insert default settings for daily_push_config if they don't exist
INSERT INTO public.settings (id, api_key, updated_at, updated_by)
VALUES (
    'daily_push_config',
    '{"enabled":false,"days":[1,2,3,4,5],"time":"08:00","title":"⏰ Hora das Evoluções!","body":"Não esqueça de registrar as evoluções clínicas de hoje.","image_url":"","icon_url":"","destination_url":"/painel/patients"}',
    now(),
    'system'
)
ON CONFLICT (id) DO NOTHING;
