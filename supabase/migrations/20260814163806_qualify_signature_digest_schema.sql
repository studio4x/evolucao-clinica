-- pgcrypto is installed in the extensions schema on hosted Supabase projects.
-- Keep the hardened search_path and qualify digest explicitly so signing cannot
-- be broken by, or resolve through, an unexpected schema.

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
    IF NEW.status = 'signed' AND (OLD.status IS DISTINCT FROM 'signed' OR OLD.status IS NULL) THEN
        SELECT full_name, professional_register, role, subscription_status, subscription_ends_at
        INTO prof_name, prof_register, prof_role, prof_status, prof_ends
        FROM public.professionals
        WHERE id = NEW.professional_id;

        IF coalesce(prof_role, 'therapist') <> 'admin' THEN
            IF prof_status IS DISTINCT FROM 'active' AND prof_status IS DISTINCT FROM 'trialing' THEN
                RAISE EXCEPTION 'Acesso Bloqueado: Para assinar digitalmente evoluções clínicas, você precisa ter um plano ativo.';
            END IF;
            IF prof_ends IS NOT NULL AND prof_ends < NOW() THEN
                RAISE EXCEPTION 'Acesso Bloqueado: Seu plano de assinatura expirou. Regularize para assinar digitalmente.';
            END IF;
        END IF;

        NEW.signature_date := NOW();

        BEGIN
            ip_address := current_setting('request.headers', true)::json->>'x-forwarded-for';
        EXCEPTION WHEN OTHERS THEN
            ip_address := '127.0.0.1';
        END;
        NEW.signature_ip := coalesce(ip_address, '127.0.0.1');

        NEW.signed_by_name := coalesce(prof_name, 'Profissional de Saúde');
        NEW.signed_by_register := coalesce(prof_register, 'Registro não informado');
        NEW.signature_method := 'app_key';

        hash_input := NEW.id::text || '|' ||
                      coalesce(NEW.transcription_text, '') || '|' ||
                      NEW.signature_date::text || '|' ||
                      NEW.signature_ip || '|' ||
                      NEW.signed_by_name || '|' ||
                      NEW.signed_by_register;

        NEW.signature_hash := encode(extensions.digest(hash_input, 'sha256'), 'hex');
    END IF;

    IF OLD.status = 'signed' THEN
        RAISE EXCEPTION 'Não é permitido alterar uma evolução clínica já assinada digitalmente.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public;

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
    IF NEW.status = 'signed' AND (OLD.status IS DISTINCT FROM 'signed' OR OLD.status IS NULL) THEN
        SELECT full_name, professional_register, role, subscription_status, subscription_ends_at
        INTO prof_name, prof_register, prof_role, prof_status, prof_ends
        FROM public.professionals
        WHERE id = NEW.professional_id;

        IF coalesce(prof_role, 'therapist') <> 'admin' THEN
            IF prof_status IS DISTINCT FROM 'active' AND prof_status IS DISTINCT FROM 'trialing' THEN
                RAISE EXCEPTION 'Acesso Bloqueado: Para assinar digitalmente relatórios e PDIs, você precisa ter um plano ativo.';
            END IF;
            IF prof_ends IS NOT NULL AND prof_ends < NOW() THEN
                RAISE EXCEPTION 'Acesso Bloqueado: Seu plano de assinatura expirou. Regularize para assinar digitalmente.';
            END IF;
        END IF;

        NEW.signature_date := NOW();

        BEGIN
            ip_address := current_setting('request.headers', true)::json->>'x-forwarded-for';
        EXCEPTION WHEN OTHERS THEN
            ip_address := '127.0.0.1';
        END;
        NEW.signature_ip := coalesce(ip_address, '127.0.0.1');

        NEW.signed_by_name := coalesce(prof_name, 'Profissional de Saúde');
        NEW.signed_by_register := coalesce(prof_register, 'Registro não informado');
        NEW.signature_method := 'app_key';

        hash_input := NEW.id::text || '|' ||
                      coalesce(NEW.content, '') || '|' ||
                      NEW.signature_date::text || '|' ||
                      NEW.signature_ip || '|' ||
                      NEW.signed_by_name || '|' ||
                      NEW.signed_by_register;

        NEW.signature_hash := encode(extensions.digest(hash_input, 'sha256'), 'hex');
    END IF;

    IF OLD.status = 'signed' THEN
        RAISE EXCEPTION 'Não é permitido alterar um relatório ou PDI já assinado digitalmente.';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public;
