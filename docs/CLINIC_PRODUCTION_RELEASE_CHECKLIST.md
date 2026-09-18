# Checklist de release controlado — Clínica

Produção: **BLOCKED**. `main`, Vercel produção, Supabase produção e Stripe Live não foram alterados nesta rodada.
O relatório técnico está em `FASE_6_HOMOLOGACAO_LANCAMENTO_CONTROLADO.md`; o plano de SQL está em `CLINIC_PRODUCTION_MIGRATION_PLAN.md`.

## Gates bloqueantes

- [ ] **LEGAL / PRIVACY: BLOCKING FOR REAL DATA PILOT.** Validação apropriada de privacidade, base jurídica, responsabilidades clínicas, retenção/exclusão, compartilhamento entre profissionais, consentimento quando aplicável e termos do Plano Clínica. Status PENDING; sem conclusão jurídica inferida.
- [ ] Brevo: remetente verificado no provider; tracking e click tracking OFF; sem rewriting. Autorização explícita para exatamente um destinatário controlado antes do SEND. Confirmar delivered, recebimento, raw link com `#invite`, aceite pelo link recebido e cleanup. Nenhum endereço pode ser inferido de configuração/histórico.
- [ ] Stripe Live: rodada separada autorizada, conta/keys/webhook/catalog price IDs/environment confirmados; sem reutilizar Test IDs. A homologação Test não aprova Live.
- [ ] Checkout interativo Test concluído, pago e confirmado por webhook/banco, caso o relatório técnico ainda indique MANUAL_GATE.
- [ ] Proveniência de aplicação das migrations 01–22 reconciliada e comparação dos corpos de funções registrada. Manifesto completo e equivalente canônico de produção revisado.
- [ ] Backend/template de convites e billing compatíveis com production por contrato explícito; guards staging/Sandbox não podem ser retirados sem os checks equivalentes.

## Sequência futura, somente após aprovação humana

1. Identificar a organização piloto, owner, responsáveis pela operação e janela. Aprovar allowlist explícita. Default/global OFF; nenhum rollout para todas as organizações.
2. Registrar deployment e inventário de banco anteriores; backup recuperável e ensaio de restauração. Confirmar plano de rollback, executor e critério de parada.
3. Verificar projeto/ref e ambiente de produção por duas fontes; aplicar exclusivamente as migrations canônicas aprovadas na ordem do plano, com gates OFF e ledger de checksums. Nunca executar origens staging literalmente nem `db push` automático desta série.
4. Publicar deployment compatível autorizado. Confirmar HTTP 200 JSON no health e commit efetivamente servido; manter todos os gates OFF.
5. Revalidar RLS/grants/ACL/search_path e regressão pessoal com fixtures sintéticas, depois removê-las. Google produção permanece inalterado; Drive empresarial continua desabilitado.
6. Verificar Stripe Live e Brevo production na rodada autorizada. Segredos somente server-side; conferir provider e banco, não apenas redirects ou deploy READY.
7. Habilitar apenas a organização piloto aprovada; conferir gates administrativos, entitlement e seats antes de aceitar convites. O helper atual exige gate global técnico AND flag por organização: global=false bloqueia inclusive o piloto. Portanto, revisar/autorizar explicitamente a política de admissão; não ligar o gate global isoladamente nem ativar flags de outras organizações. Se global OFF absoluto continuar obrigatório, manter piloto bloqueado até haver equivalente aprovado.
8. Monitorar health, falhas e latência das APIs, context hydration, entrega/aceite de convites, webhook lag/failures, divergência Stripe/banco, seat overflow e tentativas negadas. Nenhum conteúdo clínico, token ou credencial em logs/telemetria.
9. Após janela aprovada, revisar métricas/evidências e decidir humanamente por continuar, desligar o piloto ou autorizar expansão limitada. Não fazer rollout global automático.

## Rollback e observabilidade

Rollback imediato: leak cross-tenant/cross-author, convite aceito por usuário incorreto, autoria/hash alterados, perda de histórico ou reconciliação comercial incorreta persistente. Parar novas operações; desabilitar flag piloto e gate da Clínica, delivery e novas mutações billing; retornar ao deployment compatível aprovado. Denials generalizados ou aumento sustentado de 5xx também exigem decisão de rollback.
Guardar audit/ledger e evidência sanitizada do incidente. Webhooks existentes devem ter tratamento operacional explícito para não perder reconciliação de eventos já emitidos; desligar mutações não significa apagar contratos Stripe.
Não apagar schema ou dados: preservar organizations, memberships, pacientes, evoluções, audit e billing ledger. Não tentar rollback de ownership/history por edição direta. Backup restore exige revisão do impacto em writes e events posteriores.

## Estado desta rodada

Piloto permitido: somente interno sintético em staging. Piloto com dados reais: **BLOCKED_BY_LEGAL_GATE**.
Entrega real Brevo: **PENDING_EXPLICIT_AUTHORIZATION**. Legal: **PENDING**. Release produção: **BLOCKED**.
Esta lista é a sequência futura a revisar, não uma autorização de merge/deploy/apply/rollout.
