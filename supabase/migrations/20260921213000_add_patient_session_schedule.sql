alter table public.patients
  add column if not exists session_schedule jsonb not null default '[]'::jsonb,
  add column if not exists evolution_reminder_delay_hours integer not null default 1;

alter table public.patients
  drop constraint if exists patients_session_schedule_array_check,
  add constraint patients_session_schedule_array_check
    check (jsonb_typeof(session_schedule) = 'array');

alter table public.patients
  drop constraint if exists patients_evolution_reminder_delay_hours_check,
  add constraint patients_evolution_reminder_delay_hours_check
    check (evolution_reminder_delay_hours between 0 and 168);

update public.patients p
set session_schedule = coalesce((
  select jsonb_agg(
    jsonb_build_object(
      'weekday', day_value,
      'time', to_char(p.session_time, 'HH24:MI')
    )
    order by day_value
  )
  from unnest(coalesce(p.session_days, '{}'::integer[])) as day_value
), '[]'::jsonb)
where jsonb_array_length(coalesce(p.session_schedule, '[]'::jsonb)) = 0
  and p.session_time is not null
  and cardinality(coalesce(p.session_days, '{}'::integer[])) > 0;

create or replace function public.validate_patient_session_schedule()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  invalid_count integer;
  duplicate_count integer;
  first_time text;
begin
  if new.session_schedule is null then
    new.session_schedule := '[]'::jsonb;
  end if;

  if jsonb_typeof(new.session_schedule) <> 'array' then
    raise exception 'A agenda de sessões precisa ser uma lista.';
  end if;

  if jsonb_array_length(new.session_schedule) > 50 then
    raise exception 'A agenda de sessões aceita no máximo 50 horários.';
  end if;

  select count(*)::integer
  into invalid_count
  from jsonb_array_elements(new.session_schedule) item
  where jsonb_typeof(item) <> 'object'
     or not (item ? 'weekday')
     or not (item ? 'time')
     or coalesce(item->>'weekday', '') !~ '^[0-6]$'
     or coalesce(item->>'time', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$';

  if invalid_count > 0 then
    raise exception 'A agenda contém dia da semana ou horário inválido.';
  end if;

  select count(*)::integer - count(distinct ((item->>'weekday') || '|' || (item->>'time')))::integer
  into duplicate_count
  from jsonb_array_elements(new.session_schedule) item;

  if duplicate_count > 0 then
    raise exception 'A agenda contém horários duplicados.';
  end if;

  select coalesce(array_agg(distinct (item->>'weekday')::integer order by (item->>'weekday')::integer), '{}'::integer[])
  into new.session_days
  from jsonb_array_elements(new.session_schedule) item;

  select item->>'time'
  into first_time
  from jsonb_array_elements(new.session_schedule) item
  order by (item->>'weekday')::integer, item->>'time'
  limit 1;

  new.session_time := case when first_time is null then null else first_time::time end;
  return new;
end;
$$;

revoke all on function public.validate_patient_session_schedule() from public, anon;

drop trigger if exists patients_validate_session_schedule on public.patients;
create trigger patients_validate_session_schedule
before insert or update of session_schedule
on public.patients
for each row execute function public.validate_patient_session_schedule();

comment on column public.patients.session_schedule is
  'Agenda recorrente semanal do paciente. JSON array de objetos {"weekday":0..6,"time":"HH:MM"}.';
comment on column public.patients.evolution_reminder_delay_hours is
  'Quantidade de horas após o horário da sessão para disparar lembrete de evolução.';
