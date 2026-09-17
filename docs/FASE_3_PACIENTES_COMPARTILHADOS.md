# Fase 3 — Pacientes compartilhados

Estado: implementada no código e schema aplicado no Supabase staging; smoke
sintético pendente de credencial de Management API local.

## Escopo

Esta fase cria o vínculo de um paciente com uma organização e atribui um
profissional Primary, além de profissionais Secondary e Consultores. O modelo
individual de `patients` permanece existente e `evolutions` não é alterada.

O paciente cadastral compartilhado é acessado somente pelos RPCs autorizados da
organização. As políticas pessoais excluem pacientes que possuam vínculo em
`organization_patients`; não foi criada uma política ampla por organização.

## Autorização e invariantes

- Owner/Manager ativo podem listar, criar, editar e administrar atribuições.
- Primary ativo com acesso clínico pode consultar e editar o cadastro.
- Secondary e Consultor ativos com acesso clínico podem consultar o cadastro,
  sem edição nem administração de atribuições.
- A atribuição exige membership ativo na mesma organização e
  `clinical_access_enabled = true`.
- O helper de escrita exige entitlement `full`; o acesso de leitura preserva o
  helper existente de workspace (`full` ou `restricted`).
- Suspensos, removidos e membros administrativos sem acesso clínico não são
  elegíveis para atribuição clínica.
- Há unicidade por organização/paciente, por profissional ativo e por Primary
  ativo; paciente organizacional ativo precisa de Primary.

As atribuições são somente estruturais nesta fase: `can_create_evolution` é
sempre falso, e a UI não oferece histórico ou criação de evolução compartilhada.

## API e UI

As rotas `/api/clinic/patients` usam cliente Supabase com o JWT do usuário e
RPCs `SECURITY DEFINER`; não usam service role. A UI está em
`/painel/clinica/pacientes`, com cadastro separado e detalhe por
`organizationPatientId`. Rotas pessoais continuam sob
`PersonalContextRoute`.

## Privacidade e auditoria

Os eventos administrativos registram apenas tipo, organização, profissionais
envolvidos e estados técnicos. Não são registrados nome, telefone, notas,
texto clínico ou payload completo. Nenhuma alegação jurídica ou de conformidade
é feita pelo produto.

## Staging

A migration `20260916_23_shared_clinic_patients.sql` é aditiva e destinada
exclusivamente ao projeto `hwkdwinfckmjoriqxbjk`. O gate clínico deve permanecer
desligado fora do smoke sintético controlado. A Fase 4 e o compartilhamento de
evoluções não fazem parte desta entrega.
