# Renovação da conexão Google no Android

O aplicativo Android retorna o OAuth do Google ao WebView por meio do deep link `evolucaoclinica://auth-callback`. Isso permite que a renovação silenciosa do token do Google atualize a conexão sem exigir que o profissional refaça o login.

## Configuração obrigatória no Supabase

No painel do projeto Supabase, em **Authentication > URL Configuration > Redirect URLs**, inclua exatamente:

```
evolucaoclinica://auth-callback
```

Sem essa URL permitida, o Supabase bloqueará o retorno do OAuth. A URL não deve ser cadastrada como Site URL; ela pertence somente à lista de Redirect URLs.

## Validação no dispositivo

1. Atualize o aplicativo Android para a versão `1.0.72`.
2. Conecte uma conta Google e volte ao aplicativo.
3. Feche e reabra o aplicativo depois de pelo menos 45 minutos.
4. A renovação pode abrir brevemente o navegador do sistema e retornar sozinha ao aplicativo. Nenhuma nova senha ou confirmação deve ser pedida quando a sessão Google do dispositivo estiver válida.
5. Faça uma ação que use Drive/Docs e confirme que ela conclui sem o erro `UNAUTHENTICATED`.

O Google pode exigir interação novamente caso a pessoa revogue a autorização, saia da conta no navegador, troque a senha ou a própria sessão Google expire. Nesses casos o aplicativo solicita a reconexão antes de executar a ação dependente do Drive.
