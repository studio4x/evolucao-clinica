# Agendamentos do Evolução Clínica

Todos os agendamentos recorrentes são executados pelo Supabase com `pg_cron` e `pg_net`. A Vercel hospeda apenas os endpoints `/api/cron/*`; a inicialização do backend não cria, remove nem reprograma jobs.

## Jobs padronizados

| Job | Schedule | Endpoint | Transporte |
| --- | --- | --- | --- |
| `send-evolution-reminders-job` | `0 * * * *` | `/api/cron/send-evolution-reminders` | GET + Bearer |
| `send-trial-expiration-notices-job` | `0 * * * *` | `/api/cron/send-trial-expiration-notices` | GET + Bearer |
| `publish-journey-contents-job` | `*/5 * * * *` | `/api/cron/publish-journey-contents` | GET + Bearer |
| `send-daily-push-job` | `*/5 * * * *` | `/api/cron/send-daily-push` | GET + Bearer |
| `lifecycle-process` | `*/5 * * * *` | `/api/cron/process-lifecycle` | POST + Bearer |
| `lifecycle-schedule` | `*/15 * * * *` | `/api/cron/schedule-lifecycle` | POST + Bearer |
| `lifecycle-recalculate` | `17 3 * * *` | `/api/cron/recalculate-lifecycle` | POST + Bearer |

Os horários foram mantidos. A migration `20260806150000_standardize_supabase_cron_jobs.sql` é idempotente: remove somente esses nomes e os recria uma vez.

## Vault

Os jobs reutilizam a configuração central já existente no Vault:

- `lifecycle_origin`: `https://www.evolucaoclinica.app.br`
- `lifecycle_cron_secret`: deve ser exatamente o valor de `CRON_SECRET` no ambiente Production da Vercel

Os valores não devem aparecer em migrations, logs, commits ou relatórios. A migration interrompe a aplicação se esses secrets não estiverem configurados. A origem deve apontar diretamente ao host canônico `www`: o `pg_net` descarta o header `Authorization` quando segue um redirecionamento entre hosts.

O backend valida o Bearer contra o Vault por uma RPC `SECURITY DEFINER` restrita à `service_role`. Isso evita que a execução do cron dependa de uma cópia do secret em uma variável da Vercel e não devolve o valor do Vault em nenhuma resposta.

## Compatibilidade do endpoint

Os endpoints aceitam `Authorization: Bearer <CRON_SECRET>`. A query string `?secret=` permanece aceita temporariamente para compatibilidade com configurações antigas e deve ser removida depois de confirmada a migração de todos os consumidores.

## Verificação sanitizada

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname in (
  'send-evolution-reminders-job',
  'send-trial-expiration-notices-job',
  'publish-journey-contents-job',
  'send-daily-push-job',
  'lifecycle-process',
  'lifecycle-schedule',
  'lifecycle-recalculate'
)
order by jobname;

select jobid, status, start_time, end_time, left(return_message, 160) as return_message
from cron.job_run_details
where start_time >= now() - interval '24 hours'
order by start_time desc
limit 50;
```

Não executar claim válido da fila da Jornada durante smoke tests. A publicação editorial e o envio WhatsApp continuam independentes e não são acionados por esta migration.
