# Instruções para o Agente

## Regras obrigatórias

- Qualquer alteração em código exige atualizar a build exibida no rodapé.
- A fonte de verdade da build é [`src/components/layout/AppVersion.tsx`](src/components/layout/AppVersion.tsx).
- Use o padrão `v1.10.X` para mudanças pequenas.
- Sempre que for feita uma nova atualização dos arquivos a serem subidos no Google Play Console (gerando um novo `.aab`), deve-se incrementar e atualizar o número da versão do aplicativo móvel (`PLAY_STORE_VERSION`) em `AppVersion.tsx`.
- `PLAY_STORE_VERSION` deve sempre seguir o `versionCode` numérico do Android: para `versionCode 41`, use `PLAY_STORE_VERSION = "1.0.41"`; para `versionCode 46`, use `PLAY_STORE_VERSION = "1.0.46"`. O trecho após o último ponto deve ser exatamente igual ao `versionCode` e esses números não podem ser incrementados de forma independente.
- Ao gerar um novo `.aab`, mantenha sincronizados `AppVersion.tsx`, `app/build.gradle` (`versionCode`/`versionName`) e `twa-manifest.json` (`appVersionCode`/`appVersionName`).
- Toda tarefa concluída deve terminar com `git commit` e `git push`.
- Quando a entrega for do app principal, faça os commits finais diretamente em `main`.
- Repositório oficial: [studio4x/evolucao-clinica](https://github.com/studio4x/evolucao-clinica).


## Execução

- Preserve mudanças do usuário.
- Não misture arquivos fora do escopo sem intenção explícita.
- Valide com `npm run build` e, quando necessário, `npm run lint`.
- Antes de fechar a tarefa, confirme `git status`.
