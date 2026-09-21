update public.patients
set evolution_reminder_delay_hours = 0
where evolution_reminder_active = true
  and evolution_reminder_delay_hours = 1;

alter table public.patients
  alter column evolution_reminder_delay_hours set default 1;

comment on column public.patients.evolution_reminder_delay_hours is
  'Horas após a sessão para lembrar a evolução. Configurações antigas permanecem em 0h; novas usam 1h por padrão.';
