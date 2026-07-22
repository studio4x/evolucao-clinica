# Configuração do push nativo (FCM) no WebView

O app usa Firebase Cloud Messaging (FCM) para notificações Android nativas. O Web Push continua sendo usado nos navegadores compatíveis.

## 1. Criar o projeto Firebase

1. Acesse o [Firebase Console](https://console.firebase.google.com/) com a conta do projeto.
2. Crie um projeto ou use um projeto existente.
3. Abra **Configurações do projeto > Geral > Seus aplicativos**.
4. Clique em **Adicionar app Android**.
5. Informe exatamente o pacote `com.evolucaoclinica.app`.
6. Baixe o arquivo `google-services.json`.
7. Coloque o arquivo em `app/google-services.json` na raiz deste projeto.

Não versione esse arquivo em repositórios públicos. Ele já está no `.gitignore`.

## 2. Configurar o servidor

Em **Configurações do projeto > Contas de serviço**, gere uma nova chave privada para o Firebase Admin SDK.

No ambiente de produção do backend, crie a variável `FIREBASE_SERVICE_ACCOUNT_JSON` com o JSON completo baixado. Em ambientes como Vercel, cole o conteúdo como uma única variável, sem publicar o arquivo no Git.

O backend atual continuará usando o Web Push para tokens existentes e usará o FCM para inscrições cujo endpoint começa com `fcm:`.

## 3. Gerar e instalar o app

Com `app/google-services.json` presente:

```powershell
./gradlew.bat bundleRelease
```

O novo `.aab` deve ser enviado ao Google Play Console. Nesse momento, incremente o `versionCode` em `app/build.gradle` e `twa-manifest.json`, atualize `PLAY_STORE_VERSION` em `src/components/layout/AppVersion.tsx` para o mesmo código e gere novamente o bundle.

## 4. Ativar no dispositivo

1. Instale a nova versão do app.
2. Permita notificações quando o Android solicitar.
3. Entre na plataforma e abra **Notificações**.
4. Toque em **Ativar notificações**.
5. Confirme no painel do Firebase/backend que o token foi registrado.
6. Envie uma notificação de teste pelo painel administrativo.

O token FCM é registrado somente depois que o usuário está autenticado. Ao reinstalar ou trocar o token, o app registra o novo token automaticamente quando a tela de notificações é aberta.

## 5. Verificação rápida

- No Android, a tela deve mostrar o push como suportado, em vez de “Navegador não suportado”.
- A tabela `push_subscriptions` deve conter uma linha com `endpoint` iniciando por `fcm:`.
- No servidor, o envio deve aparecer nos logs sem o erro `FIREBASE_SERVICE_ACCOUNT_JSON ausente`.
- O teste deve criar uma notificação na bandeja mesmo com o WebView fechado.
