# Instruções para o Agente

## Autonomia de ferramentas e operação por terminal

O agente está previamente autorizado a instalar e utilizar ferramentas de desenvolvimento, teste, inspeção, diagnóstico e CLI necessárias para concluir uma tarefa. Não é necessário solicitar autorização individual para ferramentas confiáveis como Playwright, browsers necessários para testes, Supabase CLI, Vercel CLI, linters, formatadores e utilitários equivalentes.

Quando uma ferramenta for necessária, o agente deve verificar se ela já está disponível, instalar ou executar uma alternativa confiável e continuar a validação. Para ferramentas usadas apenas temporariamente, prefira `npx` ou mecanismos equivalentes e não adicione a ferramenta ao `package.json`/lockfile sem justificativa técnica permanente.

Playwright é um exemplo explícito dessa autonomia: se for necessário validar uma interface, o agente pode instalar Playwright e os browsers correspondentes, iniciar a aplicação, testar desktop/tablet/mobile, inspecionar console e gerar screenshots temporários sem pedir autorização adicional. Artefatos temporários de validação não devem ser commitados.

Essa autonomia é limitada às ferramentas. Ela não autoriza alterações externas, destrutivas ou fora do escopo da tarefa, como modificar banco de produção, executar migrations destrutivas, alterar DNS, secrets, domínios, configurações de produção ou fazer deploy não solicitado.

## Supabase e Vercel: fluxo operacional padrão

Operações no Supabase e na Vercel devem utilizar prioritariamente scripts existentes do projeto, terminal, CLI oficial, `npx` e autenticação segura já disponível no ambiente. Plugins ou conectores externos do Codex não são requisito operacional padrão; a ausência ou falta de autenticação de um plugin não deve bloquear uma tarefa que possa ser executada pelo terminal.

Antes de procurar um plugin/conector, siga esta ordem:

1. verificar scripts e documentação existentes;
2. verificar a CLI disponível no ambiente;
3. usar a CLI diretamente ou via `npx` quando apropriado;
4. reutilizar autenticação segura já configurada;
5. confirmar projeto, ambiente, branch e autorização da operação;
6. executar somente as ações previstas no escopo;
7. validar o resultado e registrar evidências sem expor segredos.

Para Supabase, prefira `supabase ...` ou `npx supabase ...`, conforme a disponibilidade e a versão do ambiente. Para Vercel, prefira `vercel ...` ou `npx vercel ...`. Esses exemplos são caminhos possíveis, não comandos universais: o agente deve verificar `--help`, scripts e configuração real do projeto antes de executar.

## Autenticação, ambientes e segurança operacional

- Nunca coloque tokens, refresh tokens, access tokens, chaves, senhas ou outros secrets em `AGENTS.md`, README, código, logs, respostas ou arquivos versionados.
- Nunca versione `.env` com secrets e nunca invente credenciais alternativas.
- Verifique primeiro se a CLI já está autenticada e reutilize apenas mecanismos oficiais e seguros.
- Acesso via CLI não significa autorização irrestrita para modificar recursos.
- Antes de qualquer operação sensível, confirme explicitamente o projeto Supabase ou Vercel, o ambiente (staging/produção), a branch e a autorização da tarefa.
- Nunca aplique migration, altere schema, exclua dados, altere secrets, domínios ou variáveis de produção apenas porque a CLI está autenticada.
- Preserve a separação entre staging e produção e confirme o alvo antes de qualquer operação remota.
- Diferencie ferramenta temporária de investigação/teste, `devDependency` permanente e dependência de runtime. A autorização para instalar ferramentas não autoriza adicionar bibliotecas indiscriminadamente ao produto.

## Regras obrigatórias

- Qualquer alteração em código exige atualizar a build exibida no rodapé.
- A fonte de verdade da build é [`src/components/layout/AppVersion.tsx`](src/components/layout/AppVersion.tsx).
- Use o padrão `v1.10.X` para mudanças pequenas.
- Sempre que for feita uma nova atualização dos arquivos a serem subidos no Google Play Console (gerando um novo `.aab`), deve-se incrementar e atualizar o número da versão do aplicativo móvel (`PLAY_STORE_VERSION`) em `AppVersion.tsx`.
- `PLAY_STORE_VERSION` deve sempre seguir o `versionCode` numérico do Android: para `versionCode 41`, use `PLAY_STORE_VERSION = "1.0.41"`; para `versionCode 46`, use `PLAY_STORE_VERSION = "1.0.46"`. O trecho após o último ponto deve ser exatamente igual ao `versionCode` e esses números não podem ser incrementados de forma independente.
- Ao gerar um novo `.aab`, mantenha sincronizados `AppVersion.tsx`, `app/build.gradle` (`versionCode`/`versionName`) e `twa-manifest.json` (`appVersionCode`/`appVersionName`).
- Todo AAB preparado para distribuição no Google Play deve, após geração, assinatura e validação, ser copiado para a raiz principal do repositório. O caminho canônico é `app-release-bundle.aab` e a cópia histórica deve seguir `evolucao-clinica-v<PLAY_STORE_VERSION>-build<VERSION_CODE>.aab`.
- O fluxo oficial é `.agents/build_android_release.ps1`. Ele pode ser executado em worktree, mas deve descobrir a raiz principal pelo `git-common-dir`, validar applicationId/versionCode/versionName, assinatura, integridade com `bundletool` quando disponível e SHA-256 antes de substituir o arquivo canônico. O AAB canônico só é atualizado após validação; cópias versionadas antigas não devem ser apagadas.
- AABs são ignorados pelo Git e não devem ser commitados. O relatório de cada release deve informar commit, versões, applicationId, caminhos absolutos dos dois AABs finais, tamanho, SHA-256, validação `bundletool`, validação da assinatura e confirmação da validação no destino.
- Toda tarefa concluída deve terminar com `git commit` e `git push`.
- Quando a entrega for do app principal, faça os commits finais diretamente em `main`.
- Repositório oficial: [studio4x/evolucao-clinica](https://github.com/studio4x/evolucao-clinica).


- O dashboard de captação por rodada deve seguir obrigatoriamente [`archicteture/CAPTACAO_DASHBOARD_PADRAO.md`](archicteture/CAPTACAO_DASHBOARD_PADRAO.md); novas rodadas adicionam dados ao componente padronizado e não criam layouts próprios.

## Execução

- Preserve mudanças do usuário.
- Não misture arquivos fora do escopo sem intenção explícita.
- Valide com `npm run build` e, quando necessário, `npm run lint`.
- Antes de fechar a tarefa, confirme `git status`.
