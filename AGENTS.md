# Instruções para o Agente

## Regras obrigatórias

- Qualquer alteração em código exige atualizar a build exibida no rodapé.
- A fonte de verdade da build é [`src/components/layout/AppVersion.tsx`](src/components/layout/AppVersion.tsx).
- Use o padrão `v1.10.X` para mudanças pequenas.
- Sempre que for feita uma nova atualização dos arquivos a serem subidos no Google Play Console (gerando um novo `.aab`), deve-se incrementar e atualizar o número da versão do aplicativo móvel (`PLAY_STORE_VERSION`) em `AppVersion.tsx`.
- Toda tarefa concluída deve terminar com `git commit` e `git push`.
- Quando a entrega for do app principal, faça os commits finais diretamente em `main`.
- Repositório oficial: [studio4x/evolucao-clinica](https://github.com/studio4x/evolucao-clinica).


## Execução

- Preserve mudanças do usuário.
- Não misture arquivos fora do escopo sem intenção explícita.
- Valide com `npm run build` e, quando necessário, `npm run lint`.
- Antes de fechar a tarefa, confirme `git status`.
