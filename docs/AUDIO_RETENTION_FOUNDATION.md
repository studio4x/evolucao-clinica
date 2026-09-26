# Fundação de retenção de áudio

Esta fundação é paralela ao pipeline Gemini atual e nasce desativada. O fluxo
legado continua usando exclusivamente o bucket `temp-audio`; seus objetos não
são lidos, migrados ou removidos por esta arquitetura.

## Autoridade e retenção

- cada arquivo possui uma linha em `evolution_audio_assets`;
- `created_at` é definido pelo PostgreSQL e é imutável;
- `created_at` e `expires_at` são sobrescritos por trigger no `INSERT`, usando
  o relógio do banco e `created_at + interval '3 days'`, e ficam imutáveis;
- `expires_at <= clock_timestamp()` nega acesso mesmo se o objeto ainda existir;
- exibição de horários deve usar o timezone efetivo do navegador/profissional;
- tombstones em estado `deleted` são mantidos sem purge nesta fase.

O IndexedDB tem uma política separada: o Blob local de rascunhos e itens
pendentes é mantido por no máximo sete dias desde o primeiro salvamento local.
Esse marco não é renovado por atualizações posteriores. A remoção é
oportunística quando a fila é aberta, lida ou gravada; com o aplicativo fechado
não há execução em segundo plano.

## Segurança e lifecycle

O bucket privado `evolution-audio-assets` não possui policies de acesso direto
para `authenticated`. O backend cria uma linha `uploading` e emite um token de
upload assinado para um único caminho opaco. O finalize baixa e valida bytes,
assinatura MIME, duração, ownership e limites atuais antes de marcar o asset
como `available`.

As APIs posteriores operam por `audio_id`, nunca aceitando `storage_path` como
autoridade. URLs de leitura são assinadas sob demanda por no máximo cinco
minutos e nunca ultrapassam o tempo restante até `expires_at`.

A exclusão manual revoga acesso antes de chamar a Storage API. Falhas mantêm a
linha em `deletion_pending`. O cron horário chama a Edge Function protegida por
segredo interno; a função reclama lotes com `FOR UPDATE SKIP LOCKED`, remove o
objeto e finaliza o tombstone. Retry usa backoff de cinco minutos até o limite
de 24 horas. Objeto já ausente é considerado remoção concluída.

O sweep inverso Storage para banco (objeto sem metadata) não é executado nesta
fase, pois uma exclusão ampla sem vínculo autoritativo seria arriscada.

## Flags

- backend: `AUDIO_RETENTION_ENABLED=false`;
- frontend: `VITE_AUDIO_RETENTION_ENABLED=false`;
- cohorts opcionais: `AUDIO_RETENTION_PROFESSIONAL_IDS` e
  `VITE_AUDIO_RETENTION_PROFESSIONAL_IDS`.

O cleanup não depende das flags e continua tratando assets de QA ou assets já
existentes. Nenhum profissional entra no novo fluxo enquanto as duas flags não
forem explicitamente habilitadas em uma fase posterior.
