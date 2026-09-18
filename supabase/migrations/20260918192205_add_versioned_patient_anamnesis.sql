create table if not exists public.anamnesis_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null,
  name text not null,
  professional_group text not null,
  professional_titles text[] not null default '{}'::text[],
  version integer not null check (version > 0),
  schema jsonb not null check (jsonb_typeof(schema) = 'object'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_key, version)
);

create unique index if not exists anamnesis_templates_one_active_key_idx
  on public.anamnesis_templates(template_key)
  where is_active;

create table if not exists public.patient_anamneses (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  professional_id uuid not null references public.professionals(id) on delete cascade,
  template_id uuid not null references public.anamnesis_templates(id) on delete restrict,
  template_key text not null,
  template_name text not null,
  template_version integer not null check (template_version > 0),
  template_snapshot jsonb not null check (jsonb_typeof(template_snapshot) = 'object'),
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  status text not null default 'draft' check (status in ('draft','completed')),
  is_current boolean not null default true,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists patient_anamneses_one_current_idx
  on public.patient_anamneses(patient_id)
  where is_current;

create index if not exists patient_anamneses_patient_created_idx
  on public.patient_anamneses(patient_id, created_at desc);

create index if not exists patient_anamneses_professional_idx
  on public.patient_anamneses(professional_id);

alter table public.anamnesis_templates enable row level security;
alter table public.patient_anamneses enable row level security;

revoke all on table public.anamnesis_templates from public, anon, authenticated;
revoke all on table public.patient_anamneses from public, anon, authenticated;
grant select on table public.anamnesis_templates to authenticated;
grant select, insert, update on table public.patient_anamneses to authenticated;
grant all on table public.anamnesis_templates to service_role;
grant all on table public.patient_anamneses to service_role;

drop policy if exists anamnesis_templates_active_select on public.anamnesis_templates;
create policy anamnesis_templates_active_select
on public.anamnesis_templates for select to authenticated
using (is_active = true);

drop policy if exists patient_anamneses_owner_select on public.patient_anamneses;
create policy patient_anamneses_owner_select
on public.patient_anamneses for select to authenticated
using (
  professional_id = (select auth.uid())
  and exists (
    select 1 from public.patients p
    where p.id = patient_anamneses.patient_id
      and p.professional_id = (select auth.uid())
  )
);

drop policy if exists patient_anamneses_owner_insert on public.patient_anamneses;
create policy patient_anamneses_owner_insert
on public.patient_anamneses for insert to authenticated
with check (
  professional_id = (select auth.uid())
  and exists (
    select 1 from public.patients p
    where p.id = patient_anamneses.patient_id
      and p.professional_id = (select auth.uid())
  )
);

drop policy if exists patient_anamneses_owner_update on public.patient_anamneses;
create policy patient_anamneses_owner_update
on public.patient_anamneses for update to authenticated
using (
  professional_id = (select auth.uid())
  and exists (
    select 1 from public.patients p
    where p.id = patient_anamneses.patient_id
      and p.professional_id = (select auth.uid())
  )
)
with check (
  professional_id = (select auth.uid())
  and exists (
    select 1 from public.patients p
    where p.id = patient_anamneses.patient_id
      and p.professional_id = (select auth.uid())
  )
);

create or replace function public.touch_anamnesis_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.touch_anamnesis_updated_at() from public, anon, authenticated;

drop trigger if exists anamnesis_templates_touch_updated_at on public.anamnesis_templates;
create trigger anamnesis_templates_touch_updated_at
before update on public.anamnesis_templates
for each row execute function public.touch_anamnesis_updated_at();

drop trigger if exists patient_anamneses_touch_updated_at on public.patient_anamneses;
create trigger patient_anamneses_touch_updated_at
before update on public.patient_anamneses
for each row execute function public.touch_anamnesis_updated_at();

create or replace function public.start_patient_anamnesis(
  p_patient_id uuid,
  p_template_id uuid,
  p_archive_current boolean default false
)
returns public.patient_anamneses
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_template public.anamnesis_templates%rowtype;
  v_existing public.patient_anamneses%rowtype;
  v_created public.patient_anamneses%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required';
  end if;

  if not exists (
    select 1 from public.patients p
    where p.id = p_patient_id
      and p.professional_id = (select auth.uid())
  ) then
    raise exception 'patient_not_found_or_forbidden';
  end if;

  select * into v_template
  from public.anamnesis_templates
  where id = p_template_id
    and is_active = true;

  if not found then
    raise exception 'anamnesis_template_not_found';
  end if;

  select * into v_existing
  from public.patient_anamneses
  where patient_id = p_patient_id
    and is_current = true
  limit 1;

  if found then
    if v_existing.template_id = p_template_id then
      return v_existing;
    end if;
    if not p_archive_current then
      raise exception 'current_anamnesis_exists';
    end if;

    update public.patient_anamneses
    set is_current = false
    where id = v_existing.id;
  end if;

  insert into public.patient_anamneses (
    patient_id, professional_id, template_id, template_key, template_name,
    template_version, template_snapshot, answers, status, is_current
  )
  values (
    p_patient_id, (select auth.uid()), v_template.id, v_template.template_key, v_template.name,
    v_template.version, v_template.schema, '{}'::jsonb, 'draft', true
  )
  returning * into v_created;

  return v_created;
end;
$$;

revoke all on function public.start_patient_anamnesis(uuid,uuid,boolean) from public, anon;
grant execute on function public.start_patient_anamnesis(uuid,uuid,boolean) to authenticated, service_role;

comment on table public.anamnesis_templates is 'Templates versionados para formularios de anamnese.';
comment on table public.patient_anamneses is 'Anamneses estruturadas por paciente; cada registro preserva o snapshot do template utilizado.';

insert into public.anamnesis_templates (template_key,name,professional_group,professional_titles,version,schema,is_active)
values ('general','Geral','Geral',ARRAY[ ]::text[],1,'{"sections":[{"key":"context","title":"Contexto inicial","description":"Informações gerais relatadas pelo paciente, responsável ou acompanhante.","fields":[{"key":"informant","label":"Quem forneceu as informações?","type":"text","placeholder":"Ex.: paciente, mãe, pai, cuidador"},{"key":"main_complaint","label":"Motivo principal do atendimento","type":"textarea","placeholder":"Descreva a demanda principal com as palavras relevantes do relato."},{"key":"referral_context","label":"Encaminhamento ou contexto de chegada","type":"textarea","placeholder":"Como chegou ao atendimento e quais expectativas foram apresentadas?"},{"key":"current_follow_up","label":"Acompanhamentos atuais","type":"textarea","placeholder":"Outros profissionais, serviços ou acompanhamentos em andamento."}]},{"key":"history","title":"Histórico e rotina","fields":[{"key":"relevant_history","label":"Histórico relevante","type":"textarea","placeholder":"Eventos, condições, experiências ou informações relevantes para o acompanhamento."},{"key":"medications","label":"Medicamentos informados","type":"textarea","placeholder":"Registre somente o que foi informado pelo paciente ou responsável."},{"key":"allergies_restrictions","label":"Alergias, restrições ou cuidados informados","type":"textarea"},{"key":"daily_routine","label":"Rotina atual","type":"textarea","placeholder":"Sono, estudo, trabalho, atividades, cuidados e outros aspectos relevantes."}]},{"key":"goals","title":"Objetivos e observações","fields":[{"key":"patient_goals","label":"Objetivos e expectativas relatados","type":"textarea"},{"key":"professional_notes","label":"Observações do profissional","type":"textarea","placeholder":"Registre observações que considere importantes para organizar o acompanhamento."}]}]}'::jsonb,true)
on conflict (template_key,version) do update set
  name=excluded.name,
  professional_group=excluded.professional_group,
  professional_titles=excluded.professional_titles,
  schema=excluded.schema,
  is_active=true,
  updated_at=now();

insert into public.anamnesis_templates (template_key,name,professional_group,professional_titles,version,schema,is_active)
values ('psychology','Psicologia / Psicoterapia','Psicologia',ARRAY['Psicólogo(a)','Neuropsicólogo(a)','Psicoterapeuta','Psicanalista' ]::text[],1,'{"sections":[{"key":"context","title":"Contexto inicial","description":"Informações gerais relatadas pelo paciente, responsável ou acompanhante.","fields":[{"key":"informant","label":"Quem forneceu as informações?","type":"text","placeholder":"Ex.: paciente, mãe, pai, cuidador"},{"key":"main_complaint","label":"Motivo principal do atendimento","type":"textarea","placeholder":"Descreva a demanda principal com as palavras relevantes do relato."},{"key":"referral_context","label":"Encaminhamento ou contexto de chegada","type":"textarea","placeholder":"Como chegou ao atendimento e quais expectativas foram apresentadas?"},{"key":"current_follow_up","label":"Acompanhamentos atuais","type":"textarea","placeholder":"Outros profissionais, serviços ou acompanhamentos em andamento."}]},{"key":"history","title":"Histórico e rotina","fields":[{"key":"relevant_history","label":"Histórico relevante","type":"textarea","placeholder":"Eventos, condições, experiências ou informações relevantes para o acompanhamento."},{"key":"medications","label":"Medicamentos informados","type":"textarea","placeholder":"Registre somente o que foi informado pelo paciente ou responsável."},{"key":"allergies_restrictions","label":"Alergias, restrições ou cuidados informados","type":"textarea"},{"key":"daily_routine","label":"Rotina atual","type":"textarea","placeholder":"Sono, estudo, trabalho, atividades, cuidados e outros aspectos relevantes."}]},{"key":"goals","title":"Objetivos e observações","fields":[{"key":"patient_goals","label":"Objetivos e expectativas relatados","type":"textarea"},{"key":"professional_notes","label":"Observações do profissional","type":"textarea","placeholder":"Registre observações que considere importantes para organizar o acompanhamento."}]},{"key":"psychology_specific","title":"Aspectos emocionais e psicossociais","fields":[{"key":"emotional_behavioral_history","label":"Aspectos emocionais e comportamentais relatados","type":"textarea"},{"key":"relationships_context","label":"Relações familiares e sociais","type":"textarea"},{"key":"school_work_context","label":"Contexto escolar ou profissional","type":"textarea"},{"key":"sleep_rest","label":"Sono e descanso","type":"textarea"},{"key":"coping_resources","label":"Recursos, interesses e estratégias de enfrentamento relatadas","type":"textarea"}]}]}'::jsonb,true)
on conflict (template_key,version) do update set
  name=excluded.name,
  professional_group=excluded.professional_group,
  professional_titles=excluded.professional_titles,
  schema=excluded.schema,
  is_active=true,
  updated_at=now();

insert into public.anamnesis_templates (template_key,name,professional_group,professional_titles,version,schema,is_active)
values ('occupational_therapy','Terapia Ocupacional','Terapia Ocupacional',ARRAY['Terapeuta Ocupacional' ]::text[],1,'{"sections":[{"key":"context","title":"Contexto inicial","description":"Informações gerais relatadas pelo paciente, responsável ou acompanhante.","fields":[{"key":"informant","label":"Quem forneceu as informações?","type":"text","placeholder":"Ex.: paciente, mãe, pai, cuidador"},{"key":"main_complaint","label":"Motivo principal do atendimento","type":"textarea","placeholder":"Descreva a demanda principal com as palavras relevantes do relato."},{"key":"referral_context","label":"Encaminhamento ou contexto de chegada","type":"textarea","placeholder":"Como chegou ao atendimento e quais expectativas foram apresentadas?"},{"key":"current_follow_up","label":"Acompanhamentos atuais","type":"textarea","placeholder":"Outros profissionais, serviços ou acompanhamentos em andamento."}]},{"key":"history","title":"Histórico e rotina","fields":[{"key":"relevant_history","label":"Histórico relevante","type":"textarea","placeholder":"Eventos, condições, experiências ou informações relevantes para o acompanhamento."},{"key":"medications","label":"Medicamentos informados","type":"textarea","placeholder":"Registre somente o que foi informado pelo paciente ou responsável."},{"key":"allergies_restrictions","label":"Alergias, restrições ou cuidados informados","type":"textarea"},{"key":"daily_routine","label":"Rotina atual","type":"textarea","placeholder":"Sono, estudo, trabalho, atividades, cuidados e outros aspectos relevantes."}]},{"key":"goals","title":"Objetivos e observações","fields":[{"key":"patient_goals","label":"Objetivos e expectativas relatados","type":"textarea"},{"key":"professional_notes","label":"Observações do profissional","type":"textarea","placeholder":"Registre observações que considere importantes para organizar o acompanhamento."}]},{"key":"ot_specific","title":"Desempenho e participação ocupacional","fields":[{"key":"self_care","label":"Autocuidado e atividades de vida diária","type":"textarea"},{"key":"instrumental_activities","label":"Atividades instrumentais e rotina doméstica","type":"textarea"},{"key":"school_work_participation","label":"Participação escolar ou profissional","type":"textarea"},{"key":"play_leisure","label":"Brincar, lazer e interesses","type":"textarea"},{"key":"sensory_aspects","label":"Aspectos sensoriais relatados ou observados","type":"textarea"},{"key":"motor_functional_aspects","label":"Aspectos motores e funcionais","type":"textarea"},{"key":"environment_supports","label":"Ambiente, recursos de apoio e tecnologia assistiva","type":"textarea"}]}]}'::jsonb,true)
on conflict (template_key,version) do update set
  name=excluded.name,
  professional_group=excluded.professional_group,
  professional_titles=excluded.professional_titles,
  schema=excluded.schema,
  is_active=true,
  updated_at=now();

insert into public.anamnesis_templates (template_key,name,professional_group,professional_titles,version,schema,is_active)
values ('speech_therapy','Fonoaudiologia','Fonoaudiologia',ARRAY['Fonoaudiólogo(a)' ]::text[],1,'{"sections":[{"key":"context","title":"Contexto inicial","description":"Informações gerais relatadas pelo paciente, responsável ou acompanhante.","fields":[{"key":"informant","label":"Quem forneceu as informações?","type":"text","placeholder":"Ex.: paciente, mãe, pai, cuidador"},{"key":"main_complaint","label":"Motivo principal do atendimento","type":"textarea","placeholder":"Descreva a demanda principal com as palavras relevantes do relato."},{"key":"referral_context","label":"Encaminhamento ou contexto de chegada","type":"textarea","placeholder":"Como chegou ao atendimento e quais expectativas foram apresentadas?"},{"key":"current_follow_up","label":"Acompanhamentos atuais","type":"textarea","placeholder":"Outros profissionais, serviços ou acompanhamentos em andamento."}]},{"key":"history","title":"Histórico e rotina","fields":[{"key":"relevant_history","label":"Histórico relevante","type":"textarea","placeholder":"Eventos, condições, experiências ou informações relevantes para o acompanhamento."},{"key":"medications","label":"Medicamentos informados","type":"textarea","placeholder":"Registre somente o que foi informado pelo paciente ou responsável."},{"key":"allergies_restrictions","label":"Alergias, restrições ou cuidados informados","type":"textarea"},{"key":"daily_routine","label":"Rotina atual","type":"textarea","placeholder":"Sono, estudo, trabalho, atividades, cuidados e outros aspectos relevantes."}]},{"key":"goals","title":"Objetivos e observações","fields":[{"key":"patient_goals","label":"Objetivos e expectativas relatados","type":"textarea"},{"key":"professional_notes","label":"Observações do profissional","type":"textarea","placeholder":"Registre observações que considere importantes para organizar o acompanhamento."}]},{"key":"speech_specific","title":"Comunicação e funções relacionadas","fields":[{"key":"communication_profile","label":"Perfil de comunicação","type":"textarea"},{"key":"receptive_language","label":"Compreensão de linguagem","type":"textarea"},{"key":"expressive_language","label":"Expressão de linguagem","type":"textarea"},{"key":"speech_articulation","label":"Fala e articulação","type":"textarea"},{"key":"voice_fluency","label":"Voz e fluência","type":"textarea"},{"key":"hearing_history","label":"Histórico auditivo informado","type":"textarea"},{"key":"feeding_swallowing","label":"Alimentação e deglutição — quando pertinente","type":"textarea"}]}]}'::jsonb,true)
on conflict (template_key,version) do update set
  name=excluded.name,
  professional_group=excluded.professional_group,
  professional_titles=excluded.professional_titles,
  schema=excluded.schema,
  is_active=true,
  updated_at=now();

insert into public.anamnesis_templates (template_key,name,professional_group,professional_titles,version,schema,is_active)
values ('physiotherapy','Fisioterapia','Fisioterapia',ARRAY['Fisioterapeuta','Fisioterapeuta Neurofuncional' ]::text[],1,'{"sections":[{"key":"context","title":"Contexto inicial","description":"Informações gerais relatadas pelo paciente, responsável ou acompanhante.","fields":[{"key":"informant","label":"Quem forneceu as informações?","type":"text","placeholder":"Ex.: paciente, mãe, pai, cuidador"},{"key":"main_complaint","label":"Motivo principal do atendimento","type":"textarea","placeholder":"Descreva a demanda principal com as palavras relevantes do relato."},{"key":"referral_context","label":"Encaminhamento ou contexto de chegada","type":"textarea","placeholder":"Como chegou ao atendimento e quais expectativas foram apresentadas?"},{"key":"current_follow_up","label":"Acompanhamentos atuais","type":"textarea","placeholder":"Outros profissionais, serviços ou acompanhamentos em andamento."}]},{"key":"history","title":"Histórico e rotina","fields":[{"key":"relevant_history","label":"Histórico relevante","type":"textarea","placeholder":"Eventos, condições, experiências ou informações relevantes para o acompanhamento."},{"key":"medications","label":"Medicamentos informados","type":"textarea","placeholder":"Registre somente o que foi informado pelo paciente ou responsável."},{"key":"allergies_restrictions","label":"Alergias, restrições ou cuidados informados","type":"textarea"},{"key":"daily_routine","label":"Rotina atual","type":"textarea","placeholder":"Sono, estudo, trabalho, atividades, cuidados e outros aspectos relevantes."}]},{"key":"goals","title":"Objetivos e observações","fields":[{"key":"patient_goals","label":"Objetivos e expectativas relatados","type":"textarea"},{"key":"professional_notes","label":"Observações do profissional","type":"textarea","placeholder":"Registre observações que considere importantes para organizar o acompanhamento."}]},{"key":"physio_specific","title":"Funcionalidade e movimento","fields":[{"key":"pain_complaints","label":"Dor ou desconfortos relatados","type":"textarea"},{"key":"mobility","label":"Mobilidade e deslocamento","type":"textarea"},{"key":"functional_limitations","label":"Limitações funcionais relatadas","type":"textarea"},{"key":"injuries_surgeries","label":"Lesões, cirurgias ou internações relevantes informadas","type":"textarea"},{"key":"physical_activity","label":"Histórico de atividade física","type":"textarea"},{"key":"falls_balance","label":"Quedas, equilíbrio ou segurança no deslocamento","type":"textarea"},{"key":"mobility_aids","label":"Órteses, próteses ou dispositivos de apoio utilizados","type":"textarea"}]}]}'::jsonb,true)
on conflict (template_key,version) do update set
  name=excluded.name,
  professional_group=excluded.professional_group,
  professional_titles=excluded.professional_titles,
  schema=excluded.schema,
  is_active=true,
  updated_at=now();

insert into public.anamnesis_templates (template_key,name,professional_group,professional_titles,version,schema,is_active)
values ('psychopedagogy','Psicopedagogia','Psicopedagogia',ARRAY['Psicopedagogo(a)','Neuropsicopedagogo(a)' ]::text[],1,'{"sections":[{"key":"context","title":"Contexto inicial","description":"Informações gerais relatadas pelo paciente, responsável ou acompanhante.","fields":[{"key":"informant","label":"Quem forneceu as informações?","type":"text","placeholder":"Ex.: paciente, mãe, pai, cuidador"},{"key":"main_complaint","label":"Motivo principal do atendimento","type":"textarea","placeholder":"Descreva a demanda principal com as palavras relevantes do relato."},{"key":"referral_context","label":"Encaminhamento ou contexto de chegada","type":"textarea","placeholder":"Como chegou ao atendimento e quais expectativas foram apresentadas?"},{"key":"current_follow_up","label":"Acompanhamentos atuais","type":"textarea","placeholder":"Outros profissionais, serviços ou acompanhamentos em andamento."}]},{"key":"history","title":"Histórico e rotina","fields":[{"key":"relevant_history","label":"Histórico relevante","type":"textarea","placeholder":"Eventos, condições, experiências ou informações relevantes para o acompanhamento."},{"key":"medications","label":"Medicamentos informados","type":"textarea","placeholder":"Registre somente o que foi informado pelo paciente ou responsável."},{"key":"allergies_restrictions","label":"Alergias, restrições ou cuidados informados","type":"textarea"},{"key":"daily_routine","label":"Rotina atual","type":"textarea","placeholder":"Sono, estudo, trabalho, atividades, cuidados e outros aspectos relevantes."}]},{"key":"goals","title":"Objetivos e observações","fields":[{"key":"patient_goals","label":"Objetivos e expectativas relatados","type":"textarea"},{"key":"professional_notes","label":"Observações do profissional","type":"textarea","placeholder":"Registre observações que considere importantes para organizar o acompanhamento."}]},{"key":"learning_specific","title":"Aprendizagem e contexto escolar","fields":[{"key":"school_history","label":"Histórico escolar","type":"textarea"},{"key":"learning_concerns","label":"Principais dificuldades de aprendizagem relatadas","type":"textarea"},{"key":"literacy","label":"Leitura e escrita","type":"textarea"},{"key":"math_learning","label":"Raciocínio lógico e matemática","type":"textarea"},{"key":"attention_organization","label":"Atenção, organização e rotina de estudos","type":"textarea"},{"key":"family_school_support","label":"Apoio familiar e relação com a escola","type":"textarea"}]}]}'::jsonb,true)
on conflict (template_key,version) do update set
  name=excluded.name,
  professional_group=excluded.professional_group,
  professional_titles=excluded.professional_titles,
  schema=excluded.schema,
  is_active=true,
  updated_at=now();

insert into public.anamnesis_templates (template_key,name,professional_group,professional_titles,version,schema,is_active)
values ('nutrition','Nutrição','Nutrição',ARRAY['Nutricionista' ]::text[],1,'{"sections":[{"key":"context","title":"Contexto inicial","description":"Informações gerais relatadas pelo paciente, responsável ou acompanhante.","fields":[{"key":"informant","label":"Quem forneceu as informações?","type":"text","placeholder":"Ex.: paciente, mãe, pai, cuidador"},{"key":"main_complaint","label":"Motivo principal do atendimento","type":"textarea","placeholder":"Descreva a demanda principal com as palavras relevantes do relato."},{"key":"referral_context","label":"Encaminhamento ou contexto de chegada","type":"textarea","placeholder":"Como chegou ao atendimento e quais expectativas foram apresentadas?"},{"key":"current_follow_up","label":"Acompanhamentos atuais","type":"textarea","placeholder":"Outros profissionais, serviços ou acompanhamentos em andamento."}]},{"key":"history","title":"Histórico e rotina","fields":[{"key":"relevant_history","label":"Histórico relevante","type":"textarea","placeholder":"Eventos, condições, experiências ou informações relevantes para o acompanhamento."},{"key":"medications","label":"Medicamentos informados","type":"textarea","placeholder":"Registre somente o que foi informado pelo paciente ou responsável."},{"key":"allergies_restrictions","label":"Alergias, restrições ou cuidados informados","type":"textarea"},{"key":"daily_routine","label":"Rotina atual","type":"textarea","placeholder":"Sono, estudo, trabalho, atividades, cuidados e outros aspectos relevantes."}]},{"key":"goals","title":"Objetivos e observações","fields":[{"key":"patient_goals","label":"Objetivos e expectativas relatados","type":"textarea"},{"key":"professional_notes","label":"Observações do profissional","type":"textarea","placeholder":"Registre observações que considere importantes para organizar o acompanhamento."}]},{"key":"nutrition_specific","title":"Rotina alimentar","fields":[{"key":"food_routine","label":"Rotina e padrão alimentar relatados","type":"textarea"},{"key":"food_preferences","label":"Preferências e aversões alimentares","type":"textarea"},{"key":"food_restrictions","label":"Restrições, alergias ou intolerâncias informadas","type":"textarea"},{"key":"hydration","label":"Hidratação","type":"textarea"},{"key":"gastrointestinal","label":"Aspectos gastrointestinais relatados","type":"textarea"},{"key":"nutrition_history","label":"Histórico alimentar e nutricional relevante","type":"textarea"},{"key":"nutrition_goals","label":"Objetivos relacionados à alimentação","type":"textarea"}]}]}'::jsonb,true)
on conflict (template_key,version) do update set
  name=excluded.name,
  professional_group=excluded.professional_group,
  professional_titles=excluded.professional_titles,
  schema=excluded.schema,
  is_active=true,
  updated_at=now();

insert into public.anamnesis_templates (template_key,name,professional_group,professional_titles,version,schema,is_active)
values ('medicine','Medicina','Medicina',ARRAY['Psiquiatra','Médico(a) Generalista','Médico(a) Pediatra','Médico(a) Neurologista','Médico(a) Neuropediatra','Médico(a) Fisiatra','Médico(a) Geriatra','Médico(a) Ortopedista','Médico(a) Cardiologista','Médico(a) Dermatologista','Médico(a) Ginecologista e Obstetra' ]::text[],1,'{"sections":[{"key":"context","title":"Contexto inicial","description":"Informações gerais relatadas pelo paciente, responsável ou acompanhante.","fields":[{"key":"informant","label":"Quem forneceu as informações?","type":"text","placeholder":"Ex.: paciente, mãe, pai, cuidador"},{"key":"main_complaint","label":"Motivo principal do atendimento","type":"textarea","placeholder":"Descreva a demanda principal com as palavras relevantes do relato."},{"key":"referral_context","label":"Encaminhamento ou contexto de chegada","type":"textarea","placeholder":"Como chegou ao atendimento e quais expectativas foram apresentadas?"},{"key":"current_follow_up","label":"Acompanhamentos atuais","type":"textarea","placeholder":"Outros profissionais, serviços ou acompanhamentos em andamento."}]},{"key":"history","title":"Histórico e rotina","fields":[{"key":"relevant_history","label":"Histórico relevante","type":"textarea","placeholder":"Eventos, condições, experiências ou informações relevantes para o acompanhamento."},{"key":"medications","label":"Medicamentos informados","type":"textarea","placeholder":"Registre somente o que foi informado pelo paciente ou responsável."},{"key":"allergies_restrictions","label":"Alergias, restrições ou cuidados informados","type":"textarea"},{"key":"daily_routine","label":"Rotina atual","type":"textarea","placeholder":"Sono, estudo, trabalho, atividades, cuidados e outros aspectos relevantes."}]},{"key":"goals","title":"Objetivos e observações","fields":[{"key":"patient_goals","label":"Objetivos e expectativas relatados","type":"textarea"},{"key":"professional_notes","label":"Observações do profissional","type":"textarea","placeholder":"Registre observações que considere importantes para organizar o acompanhamento."}]},{"key":"medicine_specific","title":"História clínica relatada","fields":[{"key":"current_symptoms","label":"Sintomas e evolução relatados","type":"textarea"},{"key":"previous_conditions","label":"Condições e diagnósticos prévios informados","type":"textarea"},{"key":"surgeries_hospitalizations","label":"Cirurgias e internações informadas","type":"textarea"},{"key":"family_clinical_history","label":"Histórico familiar relevante informado","type":"textarea"},{"key":"habits_lifestyle","label":"Hábitos e estilo de vida relevantes","type":"textarea"},{"key":"previous_exams","label":"Exames ou documentos prévios mencionados","type":"textarea"}]}]}'::jsonb,true)
on conflict (template_key,version) do update set
  name=excluded.name,
  professional_group=excluded.professional_group,
  professional_titles=excluded.professional_titles,
  schema=excluded.schema,
  is_active=true,
  updated_at=now();

insert into public.anamnesis_templates (template_key,name,professional_group,professional_titles,version,schema,is_active)
values ('nursing','Enfermagem','Enfermagem',ARRAY['Enfermeiro(a)' ]::text[],1,'{"sections":[{"key":"context","title":"Contexto inicial","description":"Informações gerais relatadas pelo paciente, responsável ou acompanhante.","fields":[{"key":"informant","label":"Quem forneceu as informações?","type":"text","placeholder":"Ex.: paciente, mãe, pai, cuidador"},{"key":"main_complaint","label":"Motivo principal do atendimento","type":"textarea","placeholder":"Descreva a demanda principal com as palavras relevantes do relato."},{"key":"referral_context","label":"Encaminhamento ou contexto de chegada","type":"textarea","placeholder":"Como chegou ao atendimento e quais expectativas foram apresentadas?"},{"key":"current_follow_up","label":"Acompanhamentos atuais","type":"textarea","placeholder":"Outros profissionais, serviços ou acompanhamentos em andamento."}]},{"key":"history","title":"Histórico e rotina","fields":[{"key":"relevant_history","label":"Histórico relevante","type":"textarea","placeholder":"Eventos, condições, experiências ou informações relevantes para o acompanhamento."},{"key":"medications","label":"Medicamentos informados","type":"textarea","placeholder":"Registre somente o que foi informado pelo paciente ou responsável."},{"key":"allergies_restrictions","label":"Alergias, restrições ou cuidados informados","type":"textarea"},{"key":"daily_routine","label":"Rotina atual","type":"textarea","placeholder":"Sono, estudo, trabalho, atividades, cuidados e outros aspectos relevantes."}]},{"key":"goals","title":"Objetivos e observações","fields":[{"key":"patient_goals","label":"Objetivos e expectativas relatados","type":"textarea"},{"key":"professional_notes","label":"Observações do profissional","type":"textarea","placeholder":"Registre observações que considere importantes para organizar o acompanhamento."}]},{"key":"nursing_specific","title":"Necessidades de cuidado","fields":[{"key":"care_needs","label":"Necessidades de cuidado relatadas","type":"textarea"},{"key":"mobility_dependence","label":"Mobilidade e nível de auxílio informado","type":"textarea"},{"key":"skin_integrity","label":"Pele, feridas ou cuidados relatados","type":"textarea"},{"key":"devices","label":"Dispositivos, sondas ou recursos utilizados","type":"textarea"},{"key":"elimination","label":"Eliminações — quando pertinente","type":"textarea"},{"key":"sleep_comfort","label":"Sono, repouso e conforto","type":"textarea"}]}]}'::jsonb,true)
on conflict (template_key,version) do update set
  name=excluded.name,
  professional_group=excluded.professional_group,
  professional_titles=excluded.professional_titles,
  schema=excluded.schema,
  is_active=true,
  updated_at=now();

insert into public.anamnesis_templates (template_key,name,professional_group,professional_titles,version,schema,is_active)
values ('dentistry','Odontologia','Odontologia',ARRAY['Dentista / Odontólogo(a)' ]::text[],1,'{"sections":[{"key":"context","title":"Contexto inicial","description":"Informações gerais relatadas pelo paciente, responsável ou acompanhante.","fields":[{"key":"informant","label":"Quem forneceu as informações?","type":"text","placeholder":"Ex.: paciente, mãe, pai, cuidador"},{"key":"main_complaint","label":"Motivo principal do atendimento","type":"textarea","placeholder":"Descreva a demanda principal com as palavras relevantes do relato."},{"key":"referral_context","label":"Encaminhamento ou contexto de chegada","type":"textarea","placeholder":"Como chegou ao atendimento e quais expectativas foram apresentadas?"},{"key":"current_follow_up","label":"Acompanhamentos atuais","type":"textarea","placeholder":"Outros profissionais, serviços ou acompanhamentos em andamento."}]},{"key":"history","title":"Histórico e rotina","fields":[{"key":"relevant_history","label":"Histórico relevante","type":"textarea","placeholder":"Eventos, condições, experiências ou informações relevantes para o acompanhamento."},{"key":"medications","label":"Medicamentos informados","type":"textarea","placeholder":"Registre somente o que foi informado pelo paciente ou responsável."},{"key":"allergies_restrictions","label":"Alergias, restrições ou cuidados informados","type":"textarea"},{"key":"daily_routine","label":"Rotina atual","type":"textarea","placeholder":"Sono, estudo, trabalho, atividades, cuidados e outros aspectos relevantes."}]},{"key":"goals","title":"Objetivos e observações","fields":[{"key":"patient_goals","label":"Objetivos e expectativas relatados","type":"textarea"},{"key":"professional_notes","label":"Observações do profissional","type":"textarea","placeholder":"Registre observações que considere importantes para organizar o acompanhamento."}]},{"key":"dentistry_specific","title":"Histórico odontológico","fields":[{"key":"dental_complaint","label":"Queixa odontológica principal","type":"textarea"},{"key":"dental_history","label":"Histórico de tratamentos odontológicos","type":"textarea"},{"key":"oral_hygiene","label":"Rotina de higiene oral relatada","type":"textarea"},{"key":"oral_habits","label":"Hábitos orais relevantes","type":"textarea"},{"key":"dental_pain_sensitivity","label":"Dor, desconforto ou sensibilidade relatados","type":"textarea"},{"key":"dental_anxiety","label":"Experiências anteriores ou ansiedade relacionada ao atendimento","type":"textarea"}]}]}'::jsonb,true)
on conflict (template_key,version) do update set
  name=excluded.name,
  professional_group=excluded.professional_group,
  professional_titles=excluded.professional_titles,
  schema=excluded.schema,
  is_active=true,
  updated_at=now();

insert into public.anamnesis_templates (template_key,name,professional_group,professional_titles,version,schema,is_active)
values ('social_work','Serviço Social','Serviço Social',ARRAY['Assistente Social' ]::text[],1,'{"sections":[{"key":"context","title":"Contexto inicial","description":"Informações gerais relatadas pelo paciente, responsável ou acompanhante.","fields":[{"key":"informant","label":"Quem forneceu as informações?","type":"text","placeholder":"Ex.: paciente, mãe, pai, cuidador"},{"key":"main_complaint","label":"Motivo principal do atendimento","type":"textarea","placeholder":"Descreva a demanda principal com as palavras relevantes do relato."},{"key":"referral_context","label":"Encaminhamento ou contexto de chegada","type":"textarea","placeholder":"Como chegou ao atendimento e quais expectativas foram apresentadas?"},{"key":"current_follow_up","label":"Acompanhamentos atuais","type":"textarea","placeholder":"Outros profissionais, serviços ou acompanhamentos em andamento."}]},{"key":"history","title":"Histórico e rotina","fields":[{"key":"relevant_history","label":"Histórico relevante","type":"textarea","placeholder":"Eventos, condições, experiências ou informações relevantes para o acompanhamento."},{"key":"medications","label":"Medicamentos informados","type":"textarea","placeholder":"Registre somente o que foi informado pelo paciente ou responsável."},{"key":"allergies_restrictions","label":"Alergias, restrições ou cuidados informados","type":"textarea"},{"key":"daily_routine","label":"Rotina atual","type":"textarea","placeholder":"Sono, estudo, trabalho, atividades, cuidados e outros aspectos relevantes."}]},{"key":"goals","title":"Objetivos e observações","fields":[{"key":"patient_goals","label":"Objetivos e expectativas relatados","type":"textarea"},{"key":"professional_notes","label":"Observações do profissional","type":"textarea","placeholder":"Registre observações que considere importantes para organizar o acompanhamento."}]},{"key":"social_specific","title":"Contexto social e rede de apoio","fields":[{"key":"family_composition","label":"Composição e dinâmica familiar","type":"textarea"},{"key":"housing_context","label":"Contexto de moradia","type":"textarea"},{"key":"support_network","label":"Rede de apoio","type":"textarea"},{"key":"work_income_context","label":"Contexto de trabalho e renda — quando pertinente","type":"textarea"},{"key":"services_access","label":"Acesso a serviços, benefícios ou políticas públicas","type":"textarea"},{"key":"social_vulnerabilities","label":"Vulnerabilidades e barreiras relatadas","type":"textarea"}]}]}'::jsonb,true)
on conflict (template_key,version) do update set
  name=excluded.name,
  professional_group=excluded.professional_group,
  professional_titles=excluded.professional_titles,
  schema=excluded.schema,
  is_active=true,
  updated_at=now();

insert into public.anamnesis_templates (template_key,name,professional_group,professional_titles,version,schema,is_active)
values ('physical_education','Educação Física','Educação Física',ARRAY['Educador(a) Físico(a)' ]::text[],1,'{"sections":[{"key":"context","title":"Contexto inicial","description":"Informações gerais relatadas pelo paciente, responsável ou acompanhante.","fields":[{"key":"informant","label":"Quem forneceu as informações?","type":"text","placeholder":"Ex.: paciente, mãe, pai, cuidador"},{"key":"main_complaint","label":"Motivo principal do atendimento","type":"textarea","placeholder":"Descreva a demanda principal com as palavras relevantes do relato."},{"key":"referral_context","label":"Encaminhamento ou contexto de chegada","type":"textarea","placeholder":"Como chegou ao atendimento e quais expectativas foram apresentadas?"},{"key":"current_follow_up","label":"Acompanhamentos atuais","type":"textarea","placeholder":"Outros profissionais, serviços ou acompanhamentos em andamento."}]},{"key":"history","title":"Histórico e rotina","fields":[{"key":"relevant_history","label":"Histórico relevante","type":"textarea","placeholder":"Eventos, condições, experiências ou informações relevantes para o acompanhamento."},{"key":"medications","label":"Medicamentos informados","type":"textarea","placeholder":"Registre somente o que foi informado pelo paciente ou responsável."},{"key":"allergies_restrictions","label":"Alergias, restrições ou cuidados informados","type":"textarea"},{"key":"daily_routine","label":"Rotina atual","type":"textarea","placeholder":"Sono, estudo, trabalho, atividades, cuidados e outros aspectos relevantes."}]},{"key":"goals","title":"Objetivos e observações","fields":[{"key":"patient_goals","label":"Objetivos e expectativas relatados","type":"textarea"},{"key":"professional_notes","label":"Observações do profissional","type":"textarea","placeholder":"Registre observações que considere importantes para organizar o acompanhamento."}]},{"key":"physical_education_specific","title":"Atividade física e objetivos","fields":[{"key":"exercise_history","label":"Histórico de prática de atividade física","type":"textarea"},{"key":"activity_goals","label":"Objetivos relacionados à atividade física","type":"textarea"},{"key":"limitations_precautions","label":"Limitações ou cuidados informados","type":"textarea"},{"key":"preferred_activities","label":"Atividades de interesse ou preferência","type":"textarea"},{"key":"available_routine","label":"Rotina e disponibilidade para prática","type":"textarea"},{"key":"exercise_environment","label":"Ambiente e recursos disponíveis","type":"textarea"}]}]}'::jsonb,true)
on conflict (template_key,version) do update set
  name=excluded.name,
  professional_group=excluded.professional_group,
  professional_titles=excluded.professional_titles,
  schema=excluded.schema,
  is_active=true,
  updated_at=now();

insert into public.anamnesis_templates (template_key,name,professional_group,professional_titles,version,schema,is_active)
values ('complementary_therapies','Terapias complementares','Terapias complementares',ARRAY['Musicoterapeuta','Arteterapeuta','Equoterapeuta','Psicomotricista' ]::text[],1,'{"sections":[{"key":"context","title":"Contexto inicial","description":"Informações gerais relatadas pelo paciente, responsável ou acompanhante.","fields":[{"key":"informant","label":"Quem forneceu as informações?","type":"text","placeholder":"Ex.: paciente, mãe, pai, cuidador"},{"key":"main_complaint","label":"Motivo principal do atendimento","type":"textarea","placeholder":"Descreva a demanda principal com as palavras relevantes do relato."},{"key":"referral_context","label":"Encaminhamento ou contexto de chegada","type":"textarea","placeholder":"Como chegou ao atendimento e quais expectativas foram apresentadas?"},{"key":"current_follow_up","label":"Acompanhamentos atuais","type":"textarea","placeholder":"Outros profissionais, serviços ou acompanhamentos em andamento."}]},{"key":"history","title":"Histórico e rotina","fields":[{"key":"relevant_history","label":"Histórico relevante","type":"textarea","placeholder":"Eventos, condições, experiências ou informações relevantes para o acompanhamento."},{"key":"medications","label":"Medicamentos informados","type":"textarea","placeholder":"Registre somente o que foi informado pelo paciente ou responsável."},{"key":"allergies_restrictions","label":"Alergias, restrições ou cuidados informados","type":"textarea"},{"key":"daily_routine","label":"Rotina atual","type":"textarea","placeholder":"Sono, estudo, trabalho, atividades, cuidados e outros aspectos relevantes."}]},{"key":"goals","title":"Objetivos e observações","fields":[{"key":"patient_goals","label":"Objetivos e expectativas relatados","type":"textarea"},{"key":"professional_notes","label":"Observações do profissional","type":"textarea","placeholder":"Registre observações que considere importantes para organizar o acompanhamento."}]},{"key":"complementary_specific","title":"Interesses, experiências e participação","fields":[{"key":"previous_therapy_experiences","label":"Experiências anteriores relacionadas à abordagem","type":"textarea"},{"key":"interests_preferences","label":"Interesses e preferências","type":"textarea"},{"key":"expression_participation","label":"Formas de expressão e participação observadas ou relatadas","type":"textarea"},{"key":"sensory_motor_considerations","label":"Aspectos sensoriais ou motores relevantes","type":"textarea"},{"key":"environmental_needs","label":"Necessidades de ambiente, adaptação ou apoio","type":"textarea"}]}]}'::jsonb,true)
on conflict (template_key,version) do update set
  name=excluded.name,
  professional_group=excluded.professional_group,
  professional_titles=excluded.professional_titles,
  schema=excluded.schema,
  is_active=true,
  updated_at=now();
