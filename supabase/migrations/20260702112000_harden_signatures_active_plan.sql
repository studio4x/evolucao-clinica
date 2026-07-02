-- Atualiza o trigger de assinatura de evoluções clínicas para validar o plano ativo do profissional
CREATE OR REPLACE FUNCTION public.handle_evolution_signing()
RETURNS TRIGGER AS $$
DECLARE
    prof_name TEXT;
    prof_register TEXT;
    prof_role TEXT;
    prof_status TEXT;
    prof_ends TIMESTAMPTZ;
    ip_address TEXT;
    hash_input TEXT;
BEGIN
    -- Se a evolução está sendo assinada (mudança de status para 'signed')
    IF NEW.status = 'signed' AND (OLD.status IS DISTINCT FROM 'signed' OR OLD.status IS NULL) THEN
        -- 1. Busca dados do profissional e valida se ele tem um plano de assinatura ativo
        SELECT full_name, professional_register, role, subscription_status, subscription_ends_at
        INTO prof_name, prof_register, prof_role, prof_status, prof_ends
        FROM public.professionals
        WHERE id = NEW.professional_id;

        -- Se não for administrador, exige plano ativo e não expirado
        IF coalesce(prof_role, 'therapist') <> 'admin' THEN
            IF prof_status IS DISTINCT FROM 'active' AND prof_status IS DISTINCT FROM 'trialing' THEN
                RAISE EXCEPTION 'Acesso Bloqueado: Para assinar digitalmente evoluções clínicas, você precisa ter um plano ativo.';
            END IF;
            IF prof_ends IS NOT NULL AND prof_ends < NOW() THEN
                RAISE EXCEPTION 'Acesso Bloqueado: Seu plano de assinatura expirou. Regularize para assinar digitalmente.';
            END IF;
        END IF;

        -- 2. Captura a data/hora do servidor
        NEW.signature_date := NOW();
        
        -- 3. Captura o IP do profissional a partir dos cabeçalhos HTTP da requisição do Supabase
        BEGIN
            ip_address := current_setting('request.headers', true)::json->>'x-forwarded-for';
        EXCEPTION WHEN OTHERS THEN
            ip_address := '127.0.0.1';
        END;
        NEW.signature_ip := coalesce(ip_address, '127.0.0.1');
        
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


-- Atualiza o trigger de assinatura de relatórios clínicos para validar o plano ativo do profissional
CREATE OR REPLACE FUNCTION public.handle_report_signing()
RETURNS TRIGGER AS $$
DECLARE
    prof_name TEXT;
    prof_register TEXT;
    prof_role TEXT;
    prof_status TEXT;
    prof_ends TIMESTAMPTZ;
    ip_address TEXT;
    hash_input TEXT;
BEGIN
    -- Se o relatório está sendo assinado (mudança de status para 'signed')
    IF NEW.status = 'signed' AND (OLD.status IS DISTINCT FROM 'signed' OR OLD.status IS NULL) THEN
        -- 1. Busca dados do profissional e valida se ele tem um plano de assinatura ativo
        SELECT full_name, professional_register, role, subscription_status, subscription_ends_at
        INTO prof_name, prof_register, prof_role, prof_status, prof_ends
        FROM public.professionals
        WHERE id = NEW.professional_id;

        -- Se não for administrador, exige plano ativo e não expirado
        IF coalesce(prof_role, 'therapist') <> 'admin' THEN
            IF prof_status IS DISTINCT FROM 'active' AND prof_status IS DISTINCT FROM 'trialing' THEN
                RAISE EXCEPTION 'Acesso Bloqueado: Para assinar digitalmente relatórios e PDIs, você precisa ter um plano ativo.';
            END IF;
            IF prof_ends IS NOT NULL AND prof_ends < NOW() THEN
                RAISE EXCEPTION 'Acesso Bloqueado: Seu plano de assinatura expirou. Regularize para assinar digitalmente.';
            END IF;
        END IF;

        -- 2. Captura a data/hora do servidor
        NEW.signature_date := NOW();
        
        -- 3. Captura o IP do profissional a partir dos cabeçalhos HTTP da requisição do Supabase
        BEGIN
            ip_address := current_setting('request.headers', true)::json->>'x-forwarded-for';
        EXCEPTION WHEN OTHERS THEN
            ip_address := '127.0.0.1';
        END;
        NEW.signature_ip := coalesce(ip_address, '127.0.0.1');
        
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
