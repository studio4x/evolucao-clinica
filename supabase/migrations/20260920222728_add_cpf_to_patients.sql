alter table public.patients
  add column if not exists cpf text default null;

comment on column public.patients.cpf is
  'CPF opcional do paciente, armazenado apenas no cadastro clínico.';
