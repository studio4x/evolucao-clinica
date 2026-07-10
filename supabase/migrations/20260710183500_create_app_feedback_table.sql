-- Migration: Create App Feedback Table and Notifications Trigger
-- Target: Supabase PostgreSQL Database

-- 1. Create app_feedback table
CREATE TABLE IF NOT EXISTS public.app_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    user_name TEXT,
    user_email TEXT,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    category TEXT NOT NULL CHECK (category IN ('suggestion', 'bug', 'new_feature', 'other')),
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'in_progress', 'implemented', 'rejected')),
    admin_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for querying feedback by status, category or creation date
CREATE INDEX IF NOT EXISTS idx_app_feedback_status ON public.app_feedback(status);
CREATE INDEX IF NOT EXISTS idx_app_feedback_category ON public.app_feedback(category);
CREATE INDEX IF NOT EXISTS idx_app_feedback_created_at ON public.app_feedback(created_at DESC);

-- Enable RLS for app_feedback
ALTER TABLE public.app_feedback ENABLE ROW LEVEL SECURITY;

-- 2. Define RLS Policies
DROP POLICY IF EXISTS "Allow public anonymous and authenticated inserts" ON public.app_feedback;
CREATE POLICY "Allow public anonymous and authenticated inserts"
    ON public.app_feedback FOR INSERT
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow admins full control" ON public.app_feedback;
CREATE POLICY "Allow admins full control"
    ON public.app_feedback FOR ALL
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

-- 3. Create Function and Trigger for Admin Notification
CREATE OR REPLACE FUNCTION public.notify_admins_new_feedback()
RETURNS TRIGGER AS $$
DECLARE
    admin_user RECORD;
    truncated_msg TEXT;
BEGIN
    -- Truncar mensagem para caber de forma compacta na notificação se for muito longa
    truncated_msg := substring(NEW.message from 1 for 100);
    IF char_length(NEW.message) > 100 THEN
        truncated_msg := truncated_msg || '...';
    END IF;

    -- Iterar por todos os administradores e enviar notificação
    FOR admin_user IN 
        SELECT id FROM public.professionals 
        WHERE role = 'admin'
    LOOP
        INSERT INTO public.notifications (
            user_id, 
            title, 
            message, 
            type, 
            link
        )
        VALUES (
            admin_user.id,
            'Nova Sugestão / Avaliação',
            'O profissional ' || COALESCE(NEW.user_name, 'Anônimo') || ' enviou uma sugestão (' || NEW.rating || ' estrelas): "' || truncated_msg || '"',
            'info',
            '/admin' -- link de redirecionamento interno para a aba admin
        );
    END LOOP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger execution AFTER INSERT
DROP TRIGGER IF EXISTS trigger_notify_admins_new_feedback ON public.app_feedback;
CREATE TRIGGER trigger_notify_admins_new_feedback
    AFTER INSERT ON public.app_feedback
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_admins_new_feedback();

-- Add comments for documentation
COMMENT ON TABLE public.app_feedback IS 'Tabela que armazena as sugestões de melhorias, bugs relatados e avaliações dos utilizadores';
COMMENT ON COLUMN public.app_feedback.rating IS 'Nota atribuída ao aplicativo, de 1 a 5 estrelas';
COMMENT ON COLUMN public.app_feedback.category IS 'Categoria do feedback: suggestion, bug, new_feature ou other';
COMMENT ON COLUMN public.app_feedback.status IS 'Status da triagem interna: new, reviewed, in_progress, implemented ou rejected';
