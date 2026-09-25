# Homologação: reconexão do Google no fluxo clínico

## A — profissional conectado e token recente

1. Entre em **Pacientes**.
2. Abra um paciente e navegue por **Resumo**, **Histórico** e **Arquivos**.
3. Abra uma evolução existente.

Esperado: nenhuma abertura de navegador, deep link ou OAuth.

## B — `issuedAt` local acima de 45 minutos

Em ambiente local ou de staging, simule um `googleAccessTokenIssuedAt` antigo sem remover o token nem os escopos clínicos.

1. Abra o paciente e alterne as abas.
2. Execute uma operação Google com o token ainda aceito, como adicionar arquivo ou sincronizar o Google Docs.

Esperado: a navegação não inicia OAuth; a operação é tentada normalmente e funciona sem reconexão se o Google aceitar o token.

## C — token realmente inválido

Em ambiente seguro, provoque uma chamada Google com token revogado ou inválido.

Esperado após a chamada:

- a operação falha de forma controlada;
- o estado vira reconexão necessária;
- o conteúdo, rascunho e edição permanecem preservados;
- nenhum navegador abre sozinho.

Clique explicitamente em **Reconectar Google**.

Esperado: somente esse clique inicia o OAuth e, após o retorno, o fluxo preservado pode continuar.

## D — escopos ausentes

Use uma autorização que não contenha o escopo clínico solicitado.

Esperado: o caso permanece separado de token expirado e abre **Permissões do Google** / **Revisar permissões do Google**, usando consentimento explícito. Não deve aparecer a UX de token expirado nem um loop de redirects.

## E — primeira autorização

Use uma conta sem autorização clínica anterior e abra **Nova evolução**.

Esperado: o `GoogleSecurityModal` educativo de quatro slides continua disponível; a autorização ocorre somente após a ação do usuário e a criação do paciente/prontuário continua funcionando.

## F — Android/WebView

Sem gerar AAB ou alterar o Android, repetir A, B e C no aplicativo existente.

Esperado: entrar no paciente, montar componentes ocultos, voltar ao app e trocar abas não abrem o navegador do sistema. O navegador/deep link só aparece depois do clique explícito em **Reconectar Google**.
