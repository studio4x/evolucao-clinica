# Padrão do Dashboard de Captação por Rodada

## Objetivo

Todas as rodadas da captação do Evolução Clínica devem usar o mesmo contrato de dados, as mesmas métricas principais e a mesma ordem visual no dashboard administrativo. Diferenças históricas ou experimentais podem aparecer somente em uma seção complementar de detalhes específicos, sem alterar o núcleo comparável entre rodadas.

## Estrutura visual obrigatória

Cada aba `Rodada N` deve seguir, nesta ordem:

1. **Visão geral**
   - Planejados
   - Liberados
   - Processados
   - Enviados
   - Respostas
   - Interessados
   - Erros
   - Aguardando Meta
   - Sem interesse
   - No grupo agora
   - Taxa envio/processados
   - Taxa resposta/enviados
   - Taxa interesse/enviados
   - Taxa interesse/respostas
   - Taxa grupo/interessados

2. **Financeiro**
   - custo Meta estimado;
   - mensagens faturáveis;
   - custo por resposta;
   - custo por interessado;
   - custo por membro atual;
   - tarifa unitária usada no cálculo.

3. **Estratégia da rodada**
   - template;
   - status operacional;
   - fase;
   - origem/critério da decisão.

4. **Funil**
   - Processados → Enviados → Respostas → Interessados → No grupo agora.
   - O último estágio representa presença atual no grupo e não atribuição causal direta.

5. **Política/histórico de follow-up**
   - a seção deve existir em todas as rodadas;
   - quando desativado, mostrar explicitamente que está desativado;
   - quando houver histórico, os dados podem ser apresentados sem mudar a posição das demais seções.

6. **Membros atuais do grupo**
   - total agregado;
   - lista nominal quando disponível;
   - divergência entre total agregado e lista nominal gera aviso de qualidade, nunca indisponibilidade total do dashboard.

7. **Fonte de dados**
   - link para a aba de controle ou planilha de origem.

8. **Detalhes específicos**
   - A/B, áreas, templates históricos ou outras particularidades;
   - sempre depois do núcleo padronizado.

## Contrato de dados obrigatório

Toda ação `dashboard_roundN` do workflow deve retornar:

```text
ok
round
phase
scope
workflow
updated_at
sample_size
status
template
origin_decision
contacts_sheet_url
overall
funnel
group_members
followups
```

`overall` deve usar os mesmos nomes em todas as rodadas:

```text
planned
released
processed
sent
delivered
pending_meta
failures
responses
interested
no_interest
group_members
delivery_rate
response_rate
interest_rate
response_to_interest_rate
```

Quando uma métrica histórica não existir, ela deve ser omitida ou retornada como `null`; nunca inventar `0` apenas para preencher o layout.

## Regras de validação

- Não usar totais históricos fixos como condição de disponibilidade, por exemplo `sent === 421`.
- Validar estrutura e presença das fontes essenciais, não valores que naturalmente mudam.
- Divergência entre `group_members` e a quantidade de nomes identificados deve gerar `data_warning`, não `ok=false`.
- Falha real de leitura, ausência da coorte ou ausência de campos estruturais obrigatórios pode retornar `roundN_data_incomplete`.
- A aba Geral deve consolidar apenas rodadas carregadas com sucesso e informar quando o consolidado estiver parcial.

## Financeiro

A tarifa unitária de Marketing é centralizada no backend.

Variável:

`EVOLUCAO_CLINICA_META_MARKETING_UNIT_COST_BRL`

O frontend não deve possuir uma tarifa operacional independente. O fallback existe apenas para continuidade visual e deve acompanhar a referência definida no backend.

A cobrança deve priorizar `delivered`. Quando a fonte histórica não possuir entrega separada, `sent` pode ser usado como aproximação, com aviso explícito no dashboard.

## Checklist para nova rodada

Ao criar `Rodada N`:

1. criar/congelar a coorte em `Rodada N - Controle`;
2. adicionar `dashboard_roundN` no workflow de lotes;
3. retornar o contrato padronizado acima;
4. adicionar a rodada em `api/campaign-dashboard.ts`;
5. adicionar a rodada em `RoundNumber`, `AVAILABLE_ROUNDS` e `GENERAL_ROUNDS`;
6. garantir que a aba use `StandardRoundDashboard`, sem JSX específico duplicado;
7. validar a aba Geral;
8. validar financeiro e funil;
9. executar `npm run lint` e `npm run build`;
10. atualizar a build em `src/components/layout/AppVersion.tsx`;
11. não criar novo layout exclusivo para a rodada.

## Princípio de manutenção

**Uma nova rodada adiciona dados; não adiciona um novo layout.**

O componente padronizado é a fonte de verdade visual para todas as rodadas.
