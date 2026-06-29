-- Habilitar pgcrypto para hash SHA-256
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Alterar a tabela evolutions
ALTER TABLE public.evolutions 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed',
ADD COLUMN IF NOT EXISTS signature_method TEXT,
ADD COLUMN IF NOT EXISTS signature_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS signature_ip TEXT,
ADD COLUMN IF NOT EXISTS signature_hash TEXT,
ADD COLUMN IF NOT EXISTS signed_by_name TEXT,
ADD COLUMN IF NOT EXISTS signed_by_register TEXT;

-- Índice para busca rápida de status
CREATE INDEX IF NOT EXISTS idx_evolutions_status ON public.evolutions(status);

-- Função de trigger para assinar e trancar a evolução clínica
CREATE OR REPLACE FUNCTION public.handle_evolution_signing()
RETURNS TRIGGER AS $$
DECLARE
    prof_name TEXT;
    prof_register TEXT;
    ip_address TEXT;
    hash_input TEXT;
BEGIN
    -- Se a evolução está sendo assinada (mudança de status para 'signed')
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
                      coalesce(NEW.transcription_text, '') || '|' || 
                      NEW.signature_date::text || '|' || 
                      NEW.signature_ip || '|' || 
                      NEW.signed_by_name || '|' || 
                      NEW.signed_by_register;
                      
        NEW.signature_hash := encode(digest(hash_input, 'sha256'), 'hex');
    END IF;
    
    -- Bloquear alteração após assinado
    IF OLD.status = 'signed' THEN
        RAISE EXCEPTION 'Não é permitido alterar uma evolução clínica já assinada digitalmente.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Criar a trigger trigger_evolutions_signing
DROP TRIGGER IF EXISTS trigger_evolutions_signing ON public.evolutions;
CREATE TRIGGER trigger_evolutions_signing
BEFORE UPDATE ON public.evolutions
FOR EACH ROW
EXECUTE FUNCTION public.handle_evolution_signing();

-- Função de trigger para bloquear deleção de evoluções assinadas
CREATE OR REPLACE FUNCTION public.prevent_signed_evolution_deletion()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = 'signed' THEN
        RAISE EXCEPTION 'Não é permitido excluir uma evolução clínica que já foi assinada digitalmente.';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Criar a trigger trigger_prevent_signed_evolution_deletion
DROP TRIGGER IF EXISTS trigger_prevent_signed_evolution_deletion ON public.evolutions;
CREATE TRIGGER trigger_prevent_signed_evolution_deletion
BEFORE DELETE ON public.evolutions
FOR EACH ROW
EXECUTE FUNCTION public.prevent_signed_evolution_deletion();
