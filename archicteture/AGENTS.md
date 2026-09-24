# Agent Instructions (Repository Scope)

These instructions apply to any AI agent working in this repository.

## Mandatory Build Version Rule
- The footer build version shown as `Build vX.Y.Z` must change on every local build.
- Source of truth: `src/components/layout/AppVersion.tsx`.
- Build commands must always execute the automatic bump script before compiling.
- In CI/deploy environments (`CI=true`), bump is skipped by default to avoid double increment between local and deploy builds.
- To force CI bump, set `HCM_BUMP_IN_CI=1`.
- This rule is mandatory regardless of active chat session or agent identity.

## Android / Play Store Version Rule

- `PLAY_STORE_VERSION` in `src/components/layout/AppVersion.tsx` must always be `1.0.<versionCode>`, using the numeric `versionCode` from `app/build.gradle`.
- Example: `versionCode 41` means `PLAY_STORE_VERSION = "1.0.41"`.
- Keep `versionName` in `app/build.gradle` and `appVersionCode`/`appVersionName` in `twa-manifest.json` synchronized with the same number when generating an Android bundle.
- Todo AAB preparado para Google Play deve, depois de gerado, assinado e validado, ser entregue na raiz principal do repositório. O caminho canônico é `app-release-bundle.aab`; a cópia versionada usa `evolucao-clinica-v<PLAY_STORE_VERSION>-build<VERSION_CODE>.aab`.
- Worktrees podem executar o build, mas `.agents/build_android_release.ps1` deve descobrir a raiz principal via `git-common-dir`. O arquivo canônico somente pode ser substituído após validação no AAB de origem e no destino, incluindo applicationId, versionCode, versionName, assinatura, `bundletool validate` quando disponível e SHA-256. AABs permanecem fora do Git.
- O relatório final deve informar commit, versões, applicationId, caminhos absolutos, tamanho, SHA-256, resultado da validação da assinatura, resultado do `bundletool` e confirmação de que os arquivos no destino foram validados.

## Required Build Commands
- `npm run build`
- `npm run build:dev`

Both commands already include the build-version bump step and must not bypass it.

## Mandatory Deploy Rule
- After every completed code/content change that should go live, the agent must perform a deploy in the same turn instead of stopping at local edits.
- Explicitly documentation-only or operational-instructions tasks are exempt when the task says not to deploy. They must still be committed and pushed when the repository workflow requires it.
- Default target is production deploy for the linked Vercel project, unless the user explicitly asks for another environment.
- Minimum flow: validate the change, run the appropriate build, then deploy.
- If deploy cannot be completed because of missing credentials, missing CLI, remote outage, or another external blocker, the agent must state exactly what blocked the deploy and what command/step remains pending.

## Edge Function 401 Playbook (Admin Sync Actions)
- If an admin-triggered Edge Function returns `401` from `functions/v1/...`, do this first:
  1. Treat browser-extension logs (e.g., Kaspersky `inspector.js`) as noise unless they reference your own domain/function.
  2. Ensure frontend sends a fresh session token:
     - Call `supabase.auth.getSession()` + `supabase.auth.refreshSession()`.
     - Send `Authorization: Bearer <access_token>`.
     - Prefer `fetch` with explicit headers over `supabase.functions.invoke` when diagnosing auth problems.
  3. Include fallback token in body: `{ access_token: <access_token> }`.

- If gateway-level `401` persists, use this hardened pattern:
  1. Deploy function with `--no-verify-jwt`.
  2. Inside the function, validate auth manually:
     - Read token from `Authorization` header OR request body `access_token`.
     - Validate with `supabaseAdmin.auth.getUser(token)`.
     - Enforce admin permission from `profiles` (`is_admin` or `role === "admin"`).
     - Return explicit JSON errors (`401 token ausente/invalido`, `403 acesso negado`).
  3. Keep function secure by requiring token and role checks before any privileged SQL.

- Required deploy pattern for this scenario:
  - `npx supabase functions deploy <function-name> --project-ref <ref> --no-verify-jwt`

- Frontend request pattern for admin sync functions:
  - `POST ${SUPABASE_URL}/functions/v1/<function-name>`
  - Headers: `Content-Type: application/json`, `apikey`, `Authorization: Bearer <access_token>`
  - Body: `{ access_token: <access_token> }`

- Apply this technique to all future "admin maintenance/sync/setup" functions when auth instability appears.
