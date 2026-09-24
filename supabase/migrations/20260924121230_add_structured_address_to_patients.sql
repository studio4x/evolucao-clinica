alter table public.patients
  add column if not exists postal_code text default null,
  add column if not exists street text default null,
  add column if not exists address_number text default null,
  add column if not exists address_complement text default null,
  add column if not exists neighborhood text default null,
  add column if not exists city text default null,
  add column if not exists state text default null;

comment on column public.patients.postal_code is 'CEP opcional do endereço do paciente.';
comment on column public.patients.street is 'Logradouro opcional do endereço do paciente.';
comment on column public.patients.address_number is 'Número opcional do endereço do paciente.';
comment on column public.patients.address_complement is 'Complemento opcional do endereço do paciente.';
comment on column public.patients.neighborhood is 'Bairro opcional do endereço do paciente.';
comment on column public.patients.city is 'Cidade opcional do endereço do paciente.';
comment on column public.patients.state is 'UF opcional do endereço do paciente.';
