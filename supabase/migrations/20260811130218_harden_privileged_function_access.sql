create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.professionals
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;
revoke all on function private.is_admin() from public, anon, authenticated;
grant execute on function private.is_admin() to authenticated, service_role;

create or replace function public.is_admin()
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return false;
  end if;
  return private.is_admin();
end;
$$;
revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

alter function public.is_active() security invoker;
alter function public.is_active() set search_path = pg_catalog, public;
alter function public.get_support_business_hours_config() security invoker;
alter function public.get_support_business_hours_config() set search_path = pg_catalog, public;
alter function public.is_support_business_minute(timestamp with time zone) security invoker;
alter function public.is_support_business_minute(timestamp with time zone) set search_path = pg_catalog, public;
alter function public.align_support_business_start(timestamp with time zone) security invoker;
alter function public.align_support_business_start(timestamp with time zone) set search_path = pg_catalog, public;
alter function public.add_support_business_minutes(timestamp with time zone, integer) security invoker;
alter function public.add_support_business_minutes(timestamp with time zone, integer) set search_path = pg_catalog, public;
alter function public.compute_support_sla_status(timestamp with time zone, timestamp with time zone) security invoker;
alter function public.compute_support_sla_status(timestamp with time zone, timestamp with time zone) set search_path = pg_catalog, public;

alter function public.activation_status_for_level(integer, text) set search_path = pg_catalog, public;
alter function public.calculate_activation_level(boolean, integer, integer, integer, integer, integer) set search_path = pg_catalog, public;
alter function public.force_delete_professional(uuid) set search_path = pg_catalog, public;
alter function public.handle_evolution_signing() set search_path = pg_catalog, public;
alter function public.handle_evolution_text_change() set search_path = pg_catalog, public;
alter function public.handle_new_user() set search_path = pg_catalog, public;
alter function public.handle_report_signing() set search_path = pg_catalog, public;
alter function public.match_evolutions(vector, double precision, integer, uuid, uuid) set search_path = pg_catalog, public;
alter function public.normalize_profession_segment(text) set search_path = pg_catalog, public;
alter function public.notify_admins_new_feedback() set search_path = pg_catalog, public;
alter function public.prevent_signed_evolution_deletion() set search_path = pg_catalog, public;
alter function public.prevent_signed_report_deletion() set search_path = pg_catalog, public;
alter function public.set_onboarding_notifications_updated_at() set search_path = pg_catalog, public;
alter function public.set_updated_at() set search_path = pg_catalog, public;

revoke execute on function public.force_delete_professional(uuid) from public, anon, authenticated;
grant execute on function public.force_delete_professional(uuid) to service_role;

revoke execute on function public.claim_lifecycle_dispatches(text, integer) from public, anon, authenticated;
grant execute on function public.claim_lifecycle_dispatches(text, integer) to service_role;

revoke execute on function public.recalculate_lifecycle_user_state(uuid) from public, anon, authenticated;
grant execute on function public.recalculate_lifecycle_user_state(uuid) to service_role;

revoke execute on function public.record_lifecycle_event(uuid, text, text, text, uuid, jsonb, text, timestamp with time zone) from public, anon, authenticated;
grant execute on function public.record_lifecycle_event(uuid, text, text, text, uuid, jsonb, text, timestamp with time zone) to service_role;

revoke execute on function public.apply_support_ticket_sla_fields() from public, anon, authenticated;
revoke execute on function public.handle_evolution_signing() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_report_signing() from public, anon, authenticated;
revoke execute on function public.handle_support_message_side_effects() from public, anon, authenticated;
revoke execute on function public.lifecycle_evolutions_event_trigger() from public, anon, authenticated;
revoke execute on function public.lifecycle_migration_requests_event_trigger() from public, anon, authenticated;
revoke execute on function public.lifecycle_patient_reports_event_trigger() from public, anon, authenticated;
revoke execute on function public.lifecycle_patients_event_trigger() from public, anon, authenticated;
revoke execute on function public.lifecycle_professionals_event_trigger() from public, anon, authenticated;
revoke execute on function public.notify_admins_new_feedback() from public, anon, authenticated;
revoke execute on function public.prevent_signed_evolution_deletion() from public, anon, authenticated;
revoke execute on function public.prevent_signed_report_deletion() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

grant execute on function public.apply_support_ticket_sla_fields() to service_role;
grant execute on function public.handle_evolution_signing() to service_role;
grant execute on function public.handle_new_user() to service_role;
grant execute on function public.handle_report_signing() to service_role;
grant execute on function public.handle_support_message_side_effects() to service_role;
grant execute on function public.lifecycle_evolutions_event_trigger() to service_role;
grant execute on function public.lifecycle_migration_requests_event_trigger() to service_role;
grant execute on function public.lifecycle_patient_reports_event_trigger() to service_role;
grant execute on function public.lifecycle_patients_event_trigger() to service_role;
grant execute on function public.lifecycle_professionals_event_trigger() to service_role;
grant execute on function public.notify_admins_new_feedback() to service_role;
grant execute on function public.prevent_signed_evolution_deletion() to service_role;
grant execute on function public.prevent_signed_report_deletion() to service_role;
grant execute on function public.rls_auto_enable() to service_role;
