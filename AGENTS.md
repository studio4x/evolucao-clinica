# Instruções para o Agente

## Regras obrigatórias

- Qualquer alteração em código exige atualizar a build exibida no rodapé.
- A fonte de verdade da build é [`src/components/layout/AppVersion.tsx`](src/components/layout/AppVersion.tsx).
- Use o padrão `v1.10.X` para mudanças pequenas.
- Toda tarefa concluída deve terminar com `git commit` e `git push`.
- Quando a entrega for do app principal, faça os commits finais diretamente em `main`.

## Execução

- Preserve mudanças do usuário.
- Não misture arquivos fora do escopo sem intenção explícita.
- Valide com `npm run build` e, quando necessário, `npm run lint`.
- Antes de fechar a tarefa, confirme `git status`.
