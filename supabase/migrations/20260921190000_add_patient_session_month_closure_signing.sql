create table if not exists public.patient_session_month_closures (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  month_start date not null,
  status text not null default 'signed' check (status = 'signed'),
  sessions_count integer not null default 0 check (sessions_count >= 0),
  completed_sessions_count integer not null default 0 check (completed_sessions_count >= 0),
  signed_sessions_count integer not null default 0 check (signed_sessions_count >= 0),
  snapshot_hash text not null check (snapshot_hash ~ '^[a-f0-9]{64}$'),
  signature_method text not null default 'app_key',
  signature_date timestamptz not null,
  signature_ip text not null,
  signature_hash text not null check (signature_hash ~ '^[a-f0-9]{64}$'),
  signed_by_name text not null,
  signed_by_register text not null,
  created_at timestamptz not null default now(),
  constraint patient_session_month_closures_month_start_check
    check (month_start = date_trunc('month', month_start)::date)
);

create unique index if not exists patient_session_month_closures_unique_month
  on public.patient_session_month_closures(patient_id, professional_id, month_start);
create index if not exists patient_session_month_closures_professional_month_idx
  on public.patient_session_month_closures(professional_id, month_start desc);

alter table public.patient_session_month_closures enable row level security;

drop policy if exists patient_session_month_closures_owner_select on public.patient_session_month_closures;
create policy patient_session_month_closures_owner_select
on public.patient_session_month_closures for select to authenticated
using (
  professional_id = (select auth.uid())
  and exists (
    select 1 from public.patients p
    where p.id = patient_session_month_closures.patient_id
      and p.professional_id = (select auth.uid())
  )
);

drop policy if exists patient_session_month_closures_owner_insert on public.patient_session_month_closures;
create policy patient_session_month_closures_owner_insert
on public.patient_session_month_closures for insert to authenticated
with check (
  professional_id = (select auth.uid())
  and exists (
    select 1 from public.patients p
    where p.id = patient_session_month_closures.patient_id
      and p.professional_id = (select auth.uid())
  )
);

grant select, insert on public.patient_session_month_closures to authenticated;

create or replace function public.sign_patient_session_month()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  prof_name text;
  prof_register text;
  prof_role text;
  prof_status text;
  prof_ends timestamptz;
  ip_address text;
  month_end date;
  snapshot_text text;
  scheduled_count integer;
begin
  new.month_start := date_trunc('month', new.month_start)::date;
  month_end := (new.month_start + interval '1 month')::date;

  if new.professional_id <> (select auth.uid()) then
    raise exception 'A assinatura mensal deve ser realizada pelo próprio profissional.';
  end if;

  if not exists (
    select 1 from public.patients p
    where p.id = new.patient_id and p.professional_id = new.professional_id
  ) then
    raise exception 'Paciente e profissional não correspondem.';
  end if;

  select full_name, professional_register, role, subscription_status, subscription_ends_at
    into prof_name, prof_register, prof_role, prof_status, prof_ends
  from public.professionals where id = new.professional_id;

  if coalesce(prof_role, 'therapist') <> 'admin' then
    if prof_status is distinct from 'active' and prof_status is distinct from 'trialing' then
      raise exception 'Acesso Bloqueado: Para fechar e assinar o mês, você precisa ter um plano ativo.';
    end if;
    if prof_ends is not null and prof_ends < now() then
      raise exception 'Acesso Bloqueado: Seu plano de assinatura expirou. Regularize para fechar e assinar o mês.';
    end if;
  end if;

  select
    count(*)::integer,
    count(*) filter (where s.status = 'completed')::integer,
    count(*) filter (
      where s.status = 'completed'
        and exists (
          select 1 from public.patient_session_signatures sig
          where sig.session_id = s.id and sig.revoked_at is null
        )
    )::integer,
    count(*) filter (where s.status = 'scheduled')::integer
  into new.sessions_count, new.completed_sessions_count, new.signed_sessions_count, scheduled_count
  from public.patient_sessions s
  where s.patient_id = new.patient_id
    and s.professional_id = new.professional_id
    and s.session_date >= new.month_start
    and s.session_date < month_end
    and s.deleted_at is null;

  if new.sessions_count = 0 then
    raise exception 'Não há sessões registradas neste mês para fechar.';
  end if;
  if scheduled_count > 0 then
    raise exception 'Existem sessões ainda agendadas neste mês. Atualize a situação antes de fechar.';
  end if;
  if new.completed_sessions_count <> new.signed_sessions_count then
    raise exception 'Todas as sessões realizadas precisam estar assinadas pelo paciente ou responsável antes do fechamento.';
  end if;

  select string_agg(
    concat_ws('|',
      s.id::text, s.session_date::text, coalesce(s.session_time::text, ''), s.status,
      coalesce(s.notes, ''), coalesce(s.evolution_id::text, ''), coalesce(s.package_id::text, ''),
      coalesce(sig.id::text, ''), coalesce(sig.signer_type, ''), coalesce(sig.signer_name, ''),
      coalesce(sig.signature_sha256, ''), coalesce(sig.signed_at::text, '')
    ),
    E'\n'
    order by s.session_date, s.session_time nulls last, s.id
  )
  into snapshot_text
  from public.patient_sessions s
  left join lateral (
    select sig.* from public.patient_session_signatures sig
    where sig.session_id = s.id and sig.revoked_at is null
    order by sig.signed_at desc limit 1
  ) sig on true
  where s.patient_id = new.patient_id
    and s.professional_id = new.professional_id
    and s.session_date >= new.month_start
    and s.session_date < month_end
    and s.deleted_at is null;

  new.snapshot_hash := encode(extensions.digest(coalesce(snapshot_text, ''), 'sha256'), 'hex');
  new.signature_date := now();

  begin
    ip_address := current_setting('request.headers', true)::json->>'x-forwarded-for';
  exception when others then
    ip_address := '127.0.0.1';
  end;
  new.signature_ip := coalesce(nullif(split_part(ip_address, ',', 1), ''), '127.0.0.1');
  new.signed_by_name := coalesce(prof_name, 'Profissional de Saúde');
  new.signed_by_register := coalesce(prof_register, 'Registro não informado');
  new.signature_method := 'app_key';

  new.signature_hash := encode(
    extensions.digest(
      new.id::text || '|' || new.patient_id::text || '|' || new.professional_id::text || '|' ||
      new.month_start::text || '|' || new.snapshot_hash || '|' || new.signature_date::text || '|' ||
      new.signature_ip || '|' || new.signed_by_name || '|' || new.signed_by_register,
      'sha256'
    ),
    'hex'
  );
  return new;
end;
$$;

revoke all on function public.sign_patient_session_month() from public, anon, authenticated;
drop trigger if exists patient_session_month_closure_sign on public.patient_session_month_closures;
create trigger patient_session_month_closure_sign
before insert on public.patient_session_month_closures
for each row execute function public.sign_patient_session_month();

create or replace function public.guard_patient_session_month_closure_changes()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  raise exception 'Um mês fechado e assinado é imutável.';
end;
$$;
revoke all on function public.guard_patient_session_month_closure_changes() from public, anon, authenticated;
drop trigger if exists patient_session_month_closure_immutable_update on public.patient_session_month_closures;
create trigger patient_session_month_closure_immutable_update
before update or delete on public.patient_session_month_closures
for each row execute function public.guard_patient_session_month_closure_changes();

create or replace function public.guard_closed_patient_session_month()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if exists (
      select 1 from public.patient_session_month_closures c
      where c.patient_id = new.patient_id
        and c.professional_id = new.professional_id
        and c.month_start = date_trunc('month', new.session_date)::date
    ) then
      raise exception 'Este mês está fechado e assinado. Não é possível adicionar sessões.';
    end if;
    return new;
  end if;

  if exists (
    select 1 from public.patient_session_month_closures c
    where c.patient_id = old.patient_id
      and c.professional_id = old.professional_id
      and c.month_start = date_trunc('month', old.session_date)::date
  ) then
    raise exception 'Este mês está fechado e assinado. As sessões não podem mais ser alteradas ou excluídas.';
  end if;

  if new.session_date is distinct from old.session_date
    or new.patient_id is distinct from old.patient_id
    or new.professional_id is distinct from old.professional_id
  then
    if exists (
      select 1 from public.patient_session_month_closures c
      where c.patient_id = new.patient_id
        and c.professional_id = new.professional_id
        and c.month_start = date_trunc('month', new.session_date)::date
    ) then
      raise exception 'O mês de destino está fechado e assinado.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_closed_patient_session_month() from public, anon, authenticated;
drop trigger if exists patient_sessions_guard_closed_month on public.patient_sessions;
create trigger patient_sessions_guard_closed_month
before insert or update on public.patient_sessions
for each row execute function public.guard_closed_patient_session_month();

create or replace function public.guard_closed_month_session_signature()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  session_patient uuid;
  session_professional uuid;
  session_date_value date;
begin
  select patient_id, professional_id, session_date
  into session_patient, session_professional, session_date_value
  from public.patient_sessions
  where id = new.session_id;

  if exists (
    select 1 from public.patient_session_month_closures c
    where c.patient_id = session_patient
      and c.professional_id = session_professional
      and c.month_start = date_trunc('month', session_date_value)::date
  ) then
    raise exception 'Este mês está fechado e assinado. As assinaturas das sessões não podem ser alteradas.';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_closed_month_session_signature() from public, anon, authenticated;
drop trigger if exists patient_session_signatures_guard_closed_month_insert on public.patient_session_signatures;
create trigger patient_session_signatures_guard_closed_month_insert
before insert on public.patient_session_signatures
for each row execute function public.guard_closed_month_session_signature();
drop trigger if exists patient_session_signatures_guard_closed_month_update on public.patient_session_signatures;
create trigger patient_session_signatures_guard_closed_month_update
before update on public.patient_session_signatures
for each row execute function public.guard_closed_month_session_signature();

comment on table public.patient_session_month_closures is
  'Fechamento mensal imutável do controle de sessões, assinado digitalmente pelo profissional.';
