# Scheduler externo do Onboarding dos Usuários

O projeto Vercel está no plano Hobby, que não aceita cron jobs com execução a cada 5 ou 15 minutos. Os endpoints continuam disponíveis e protegidos por `CRON_SECRET`; a execução recorrente deve ser feita pelo Supabase usando `pg_cron`, `pg_net` e Vault.

## Pré-requisitos

1. Configure no Vercel Production o mesmo valor de `CRON_SECRET` que será salvo no Vault do Supabase.
2. Habilite as extensões `pg_cron`, `pg_net` e Vault no projeto Supabase.
3. Execute o SQL abaixo no SQL Editor do Supabase, substituindo apenas os valores indicados. Nenhum segredo deve ser commitado.

## Configuração

```sql
-- Execute uma única vez, com valores mantidos somente no Vault.
select vault.create_secret('https://evolucaoclinica.app.br', 'lifecycle_origin');
select vault.create_secret('REPLACE_WITH_THE_VERCEL_CRON_SECRET', 'lifecycle_cron_secret');

do $outer$
declare
  existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'lifecycle-process';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;

  select jobid into existing_job from cron.job where jobname = 'lifecycle-schedule';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;

  select jobid into existing_job from cron.job where jobname = 'lifecycle-recalculate';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;

  perform cron.schedule(
    'lifecycle-process',
    '*/5 * * * *',
    $$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'lifecycle_origin') || '/api/cron/process-lifecycle',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'lifecycle_cron_secret'),
          'Content-Type', 'application/json'
        ),
        body := '{"batchSize":25}'::jsonb
      );
    $$
  );

  perform cron.schedule(
    'lifecycle-schedule',
    '*/15 * * * *',
    $$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'lifecycle_origin') || '/api/cron/schedule-lifecycle',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'lifecycle_cron_secret'),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      );
    $$
  );

  perform cron.schedule(
    'lifecycle-recalculate',
    '17 3 * * *',
    $$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'lifecycle_origin') || '/api/cron/recalculate-lifecycle',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'lifecycle_cron_secret'),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
      );
    $$
  );
end;
$outer$;
```

## Verificação

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname like 'lifecycle-%'
order by jobname;

select id, status, http_status_code, error_msg, created
from net._http_response
order by id desc
limit 20;
```

Antes de ativar o envio real, mantenha `dry_run = true` e `send_enabled = false` em `/admin/lifecycle`. Depois valide uma coorte interna, preferências, links e entregas.

## Alertas de falha

Quando o envio real estiver ativo, o worker mantém a sequência de falhas em `settings` (`lifecycle_failure_alert_state`). Após 3 falhas consecutivas, envia um alerta por e-mail para todos os administradores com e-mail cadastrado. Uma entrega bem-sucedida zera a sequência e permite um novo alerta em um incidente futuro.

Os limites podem ser ajustados opcionalmente nas variáveis de ambiente `LIFECYCLE_FAILURE_ALERT_THRESHOLD` e `LIFECYCLE_FAILURE_ALERT_COOLDOWN_MINUTES`. O intervalo padrão entre tentativas de alerta é de 60 minutos.
