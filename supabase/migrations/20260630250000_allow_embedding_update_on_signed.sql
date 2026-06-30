-- Flexibilizar a trigger para permitir atualizações da coluna de embedding, bloqueando qualquer alteração clínica
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
    
    -- Bloquear alteração após assinado (exceto para atualizações de embedding técnico do RAG)
    IF OLD.status = 'signed' THEN
        IF (NEW.transcription_text IS DISTINCT FROM OLD.transcription_text OR
            NEW.session_date IS DISTINCT FROM OLD.session_date OR
            NEW.patient_id IS DISTINCT FROM OLD.patient_id OR
            NEW.professional_id IS DISTINCT FROM OLD.professional_id OR
            NEW.status IS DISTINCT FROM OLD.status OR
            NEW.signature_hash IS DISTINCT FROM OLD.signature_hash OR
            NEW.signed_by_name IS DISTINCT FROM OLD.signed_by_name OR
            NEW.signed_by_register IS DISTINCT FROM OLD.signed_by_register OR
            NEW.audio_storage_path IS DISTINCT FROM OLD.audio_storage_path OR
            NEW.audio_url IS DISTINCT FROM OLD.audio_url OR
            NEW.audio_duration_seconds IS DISTINCT FROM OLD.audio_duration_seconds) THEN
            RAISE EXCEPTION 'Não é permitido alterar uma evolução clínica já assinada digitalmente.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
