-- Migration: Create Force Delete Professional RPC
-- Description: Creates a secure security definer function to delete all professional data (even signed evolutions/reports) by temporarily disabling delete protection triggers.

CREATE OR REPLACE FUNCTION public.force_delete_professional(target_user_id UUID)
RETURNS void AS $$
BEGIN
    -- Desabilita temporariamente os triggers de exclusão de evoluções e relatórios assinados
    ALTER TABLE public.evolutions DISABLE TRIGGER trigger_prevent_signed_evolution_deletion;
    ALTER TABLE public.patient_reports DISABLE TRIGGER trigger_prevent_signed_report_deletion;

    -- 1. Limpeza explícita das tabelas secundárias para garantir integridade e evitar falhas de FK
    DELETE FROM public.usage_logs WHERE professional_id = target_user_id;
    DELETE FROM public.evolutions WHERE professional_id = target_user_id;
    DELETE FROM public.patient_reports WHERE professional_id = target_user_id;
    DELETE FROM public.patients WHERE professional_id = target_user_id;
    DELETE FROM public.transactions WHERE professional_id = target_user_id;
    DELETE FROM public.support_tickets WHERE user_id = target_user_id;
    DELETE FROM public.notifications WHERE user_id = target_user_id;
    DELETE FROM public.push_subscriptions WHERE user_id = target_user_id;
    DELETE FROM public.evolution_templates WHERE professional_id = target_user_id;
    DELETE FROM public.migration_requests WHERE user_id = target_user_id;
    DELETE FROM public.onboarding_notifications WHERE user_id = target_user_id;
    DELETE FROM public.app_feedback WHERE user_id = target_user_id;
    
    -- 2. Remove o perfil do profissional da tabela principal
    DELETE FROM public.professionals WHERE id = target_user_id;

    -- Reabilita os triggers
    ALTER TABLE public.evolutions ENABLE TRIGGER trigger_prevent_signed_evolution_deletion;
    ALTER TABLE public.patient_reports ENABLE TRIGGER trigger_prevent_signed_report_deletion;
EXCEPTION
    WHEN OTHERS THEN
        -- Garante que os triggers sejam reabilitados mesmo em caso de erro inesperado
        ALTER TABLE public.evolutions ENABLE TRIGGER trigger_prevent_signed_evolution_deletion;
        ALTER TABLE public.patient_reports ENABLE TRIGGER trigger_prevent_signed_report_deletion;
        RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
