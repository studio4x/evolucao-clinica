-- Migration: Create Force Delete Professional RPC
-- Description: Creates a secure security definer function to delete all professional data (even signed evolutions/reports) by temporarily disabling triggers.

CREATE OR REPLACE FUNCTION public.force_delete_professional(target_user_id UUID)
RETURNS void AS $$
BEGIN
    -- Desabilita temporariamente as triggers de sessão (modo replica) para a transação atual
    -- Isso permite deletar evoluções e relatórios assinados ignorando as triggers preventivas
    SET LOCAL session_replication_role = 'replica';

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

    -- Restaura a regra de replicação para o padrão
    SET LOCAL session_replication_role = 'origin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
