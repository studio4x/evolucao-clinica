-- Alterar a tabela patient_reports para adicionar colunas de assinatura digital
ALTER TABLE public.patient_reports 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft',
ADD COLUMN IF NOT EXISTS signature_method TEXT,
ADD COLUMN IF NOT EXISTS signature_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS signature_ip TEXT,
ADD COLUMN IF NOT EXISTS signature_hash TEXT,
ADD COLUMN IF NOT EXISTS signed_by_name TEXT,
ADD COLUMN IF NOT EXISTS signed_by_register TEXT;

-- Índice para busca rápida de status
CREATE INDEX IF NOT EXISTS idx_patient_reports_status ON public.patient_reports(status);

-- Função de trigger para assinar e trancar o relatório clínico
CREATE OR REPLACE FUNCTION public.handle_report_signing()
RETURNS TRIGGER AS $$
DECLARE
    prof_name TEXT;
    prof_register TEXT;
    ip_address TEXT;
    hash_input TEXT;
BEGIN
    -- Se o relatório está sendo assinado (mudança de status para 'signed')
    IF NEW.status = 'signed' AND (OLD.status IS DISTINCT FROM 'signed' OR OLD.status IS NULL) THEN
        -- 1. Captura a data/hora do servidor
        NEW.signature_date := NOW();
        
        -- 2. Captura o IP do profissional a partir dos cabeçalhos HTTP da requisição do Supabase
        BEGIN
            ip_address := current_setting('request.headers', true)::json->>'x-forwarded-for';
        EXCEPTION WHEN OTHERS THEN
            ip_address := '127.0.0.1';
        END;
        NEW.signature_ip := coalesce(ip_address, '127.0.0.1');
        
        -- 3. Captura informações do profissional logado
        SELECT full_name, professional_register 
        INTO prof_name, prof_register
        FROM public.professionals
        WHERE id = NEW.professional_id;
        
        NEW.signed_by_name := coalesce(prof_name, 'Profissional de Saúde');
        NEW.signed_by_register := coalesce(prof_register, 'Registro não informado');
        
        -- 4. Define o método
        NEW.signature_method := 'app_key';
        
        -- 5. Calcula o hash de integridade criptográfica
        hash_input := NEW.id::text || '|' || 
                       coalesce(NEW.content, '') || '|' || 
                       NEW.signature_date::text || '|' || 
                       NEW.signature_ip || '|' || 
                       NEW.signed_by_name || '|' || 
                       NEW.signed_by_register;
                       
        NEW.signature_hash := encode(digest(hash_input, 'sha256'), 'hex');
    END IF;
    
    -- Bloquear alteração após assinado
    IF OLD.status = 'signed' THEN
        RAISE EXCEPTION 'Não é permitido alterar um relatório ou PDI já assinado digitalmente.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Criar a trigger trigger_reports_signing
DROP TRIGGER IF EXISTS trigger_reports_signing ON public.patient_reports;
CREATE TRIGGER trigger_reports_signing
BEFORE UPDATE ON public.patient_reports
FOR EACH ROW
EXECUTE FUNCTION public.handle_report_signing();

-- Função de trigger para bloquear deleção de relatórios assinados
CREATE OR REPLACE FUNCTION public.prevent_signed_report_deletion()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = 'signed' THEN
        RAISE EXCEPTION 'Não é permitido excluir um relatório ou PDI que já foi assinado digitalmente.';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Criar a trigger trigger_prevent_signed_report_deletion
DROP TRIGGER IF EXISTS trigger_prevent_signed_report_deletion ON public.patient_reports;
CREATE TRIGGER trigger_prevent_signed_report_deletion
BEFORE DELETE ON public.patient_reports
FOR EACH ROW
EXECUTE FUNCTION public.prevent_signed_report_deletion();
