# Plano de Publicação na Google Play

## Objetivo

Publicar o app da plataforma na Google Play com o menor retrabalho possível, aproveitando a estrutura atual baseada em PWA.

## Recomendação

A rota mais simples para este projeto é usar **Trusted Web Activity (TWA)** com **Bubblewrap**.

Motivos:

- O app já é uma aplicação web responsiva.
- Já existe `manifest.webmanifest` gerado dinamicamente.
- Já existe `service worker` e suporte a PWA.
- Evita reescrever a interface em React Native, Flutter ou nativo Android.

## O que já está pronto no repositório

- Página pública com landing page.
- Política de privacidade e termos de serviço.
- Sitemap e robots para indexação.
- Manifesto PWA dinâmico.
- Service worker para instalação/offline.

## Pré-requisitos antes de gerar o app Android

1. Domínio público e estável.
2. Conta Google Play Console ativa.
3. Acesso ao DNS/hosting do domínio.
4. Política de privacidade publicada e acessível publicamente.
5. Termos de serviço acessíveis publicamente.
6. Ícones, screenshots e nome final do app definidos.

## Implementação sugerida

### Fase 1: Preparação do domínio

- Confirmar que a homepage pública está no domínio oficial.
- Garantir que o manifesto responda corretamente em produção.
- Publicar `/.well-known/assetlinks.json` no domínio.
- Validar que o domínio está verificado no Search Console.

### Fase 2: Empacotamento como TWA

- Instalar e configurar Bubblewrap.
- Gerar o projeto Android apontando para o manifesto do site.
- Definir `package name` Android.
- Configurar ícone, splash e nome do app.
- Validar login, Drive, share target e notificações no wrapper.

### Fase 3: Play Console

- Criar o app na Play Console.
- Preencher a ficha da loja.
- Enviar política de privacidade.
- Responder o formulário de Data Safety.
- Informar permissões, dados coletados e finalidade.
- Subir a primeira versão em teste interno.

### Fase 4: Homologação

- Instalar a build de teste em dispositivo Android.
- Verificar abertura em tela cheia.
- Testar login com Google.
- Testar fluxo de permissões.
- Testar navegação entre home, login e área logada.

### Fase 5: Publicação

- Promover a versão de teste para produção.
- Monitorar reprovações ou pendências do Google.
- Ajustar textos, listing e permissões se necessário.

## Pontos de atenção para aprovação

- A homepage precisa provar propriedade do domínio.
- A política de privacidade precisa ser pública e clara.
- O app precisa explicar de forma transparente o uso de dados sensíveis.
- O login com Google e integrações do Drive precisam funcionar no contexto Android.
- O nome do app, ícone e descrição na Play Console precisam bater com o site.

## Decisão de arquitetura

Por enquanto, a decisão recomendada é:

- **manter o app web como fonte de verdade**;
- **empacotar com TWA**;
- **publicar sem reescrever a aplicação**.

Se, no futuro, houver necessidade de recursos realmente nativos, aí faz sentido avaliar uma migração parcial para Capacitor ou React Native.

## Checklist para retomar quando a conta estiver ativa

1. Confirmar acesso à Play Console.
2. Gerar `assetlinks.json`.
3. Gerar o projeto TWA com Bubblewrap.
4. Definir package name final.
5. Preparar listing da loja.
6. Configurar Data Safety.
7. Fazer teste interno.
8. Corrigir o que o Google reprovar.
9. Publicar em produção.

## Resultado esperado

Ao final, teremos:

- um app Android na Play Store;
- o mesmo backend e frontend atuais;
- um fluxo de manutenção simples, porque o produto principal continua sendo o site/PWA.
