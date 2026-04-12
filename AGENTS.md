# Instruções para o Agente (AI)

## Versionamento de Build
Toda vez que você (o agente) fizer **QUALQUER** alteração no código do aplicativo, você **DEVE OBRIGATORIAMENTE** atualizar a versão da build exibida no rodapé do aplicativo (atualmente localizada no arquivo `src/components/Layout.tsx`).

Siga o padrão `v1.0.X` (incrementando o último número a cada nova alteração, ou mudando a versão menor/maior se for uma grande mudança). Isso garante que o usuário sempre saiba se está visualizando a versão mais recente do aplicativo em seu navegador, ajudando a identificar problemas de cache.
