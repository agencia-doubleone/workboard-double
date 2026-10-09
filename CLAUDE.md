# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

As convenções do projeto ficam no `AGENTS.md` (importado acima e compartilhado com outros agentes). Este arquivo complementa com comandos e com a arquitetura que só aparece lendo vários arquivos. Só o `AGENTS.md` é reescrito pelo `next dev`; este arquivo não.

## Comandos

- `npm run dev`: servidor de desenvolvimento. O preview do Claude (`.claude/launch.json`) sobe na porta **3001**. O login só funciona na origem igual a `BETTER_AUTH_URL`, então o `.env.local` precisa apontar para a porta que estiver em uso.
- `npm run lint`, `npm run typecheck`, `npm run build`: as checagens. Para um arquivo só: `npx eslint <arquivo>`.
- **Não há suíte de testes nem test runner.** A verificação da lógica de servidor é um script contra PGlite (`@electric-sql/pglite`, já instalado como dev) usando as factories e queries que recebem `Database`, com as migrations reais aplicadas. Rode com `npx tsx` a partir de dentro do projeto (fora dele os pacotes não resolvem) e com o código dentro de uma `main()` assíncrona: os módulos do projeto rodam como CommonJS.
- Banco: `npm run db:generate` (gera SQL em `drizzle/` a partir de `src/db/schema`; revise o SQL), depois `npm run db:migrate`. `drizzle.config.ts` e `db:seed` leem o `.env.local`, ou seja, rodam contra o Neon configurado ali; não existe banco local separado.
- `npm run db:seed`: cria `admin@doubleone.com.br` com `SEED_ADMIN_PASSWORD`. É idempotente: nunca troca a senha, só garante o papel de admin.
- `npm run cdn:check`: testa o CDN de arquivos de ponta a ponta (upload, recibo, CORS, proteções, exclusão) usando `MEDIA_CDN_URL`/`MEDIA_SIGNING_SECRET`. Não toca no banco. O PHP de `cdn/` não passa por lint nem typecheck, e não há PHP local.

## Arquitetura

**Fluxo de uma página autenticada.** `src/proxy.ts` (o antigo `middleware.ts` no Next 16) só confere se o cookie existe. Cada página é síncrona e põe, dentro de um `<Suspense>`, um componente que chama `requireSession()` ou `requireAdmin()` (`src/lib/session.ts`); veja `perfil/page.tsx` e `usuarios/page.tsx`. Para quem não é admin, `requireAdmin()` dá `notFound()`, sem redirecionar. Depois a página busca dados em `src/server/*` passando `db` e converte as linhas em tipos de view serializáveis (`types.ts`/`present.ts` ao lado da página, datas já formatadas por `src/lib/format.ts`) antes de entregar a client components. Route groups: `(auth)` é público, `(app)` tem o shell. A seção de admin da sidebar é renderizada em `(app)/layout.tsx`, dentro de `<Suspense>`.

**Mutações.** Server Actions em `actions.ts` ao lado da página retornam `ActionResult` (`{ ok: true, message }` | `{ ok: false, error, fieldErrors? }`), que os dialogs do cliente exibem via toast (sonner). O roteiro de cada ação em `usuarios/actions.ts`: `getAdminContext()` → `schema.safeParse` → carregar o alvo → travas sobre a própria conta → `auth.api.*` com `headers` → `recordAudit` → `refresh()` de `next/cache`. Os códigos de erro do Better Auth viram mensagens pt-BR em `API_ERROR_MESSAGES`.

**Montagem do auth.** `src/lib/auth-config.ts` exporta a factory `createAuth({ database, baseURL, secret })` com os hooks de auditoria (login, falha de login, logout, reset). `src/lib/auth.ts` liga a factory ao `db` do Neon e ao `env`. O Better Auth engole erros de `sendResetPassword`, então `captureResetDelivery()` usa `AsyncLocalStorage` para quem disparou o reset saber se o e-mail falhou. O `/request-password-reset` público está desligado: só o admin dispara o reset.

**Uploads.** O arquivo vai do navegador direto para o `cdn/upload.php` na KingHost. O Next só assina: `/api/media/sign` gera um token HMAC que fixa caminho, tamanho exato, tipo e usuário; o PHP grava e devolve um recibo assinado; `/api/media/complete` confere o recibo (assinatura, dono, validade de 1 h), insere em `media` e audita. Repetir o recibo devolve o mesmo registro. O formato do token (`src/server/media/token.ts`) e a lista de extensões precisam bater com `cdn/lib.php`. `token.ts` e `keys.ts` não têm `server-only`, porque o `scripts/check-cdn.ts` os usa.

**Fronteira `server-only`.** O seed roda com `tsx`, fora do Next, e por isso não pode importar módulos com `server-only`. Código usado pelo seed ou pela config do auth importa `@/server/audit/recorder` (`createAuditRecorder(db)`), nunca `@/server/audit`. `src/env.ts` valida ao ser importado, então qualquer coisa que importe `@/db` exige as variáveis de ambiente.

**Dependências escondidas.** O "último login" em `listUsers` (`src/server/users.ts`) sai da `audit_log` (maior `createdAt` da ação `auth.sign_in`), então renomear ou deixar de registrar essa ação quebra a tela de usuários. As não lidas e as menções da lista de trabalhos (`listJobs`) e a linha de "novas mensagens" da página saem de `job_read.lastReadAt`, atualizado por `markJobRead` (ao abrir a página) e por `sendMessage` (quem responde já leu o que veio antes); um fluxo novo que mostre a conversa precisa marcar a leitura também. O script de preferências no `<head>` (`src/lib/preferences.ts`) duplica a lógica de `applyTheme`/`applySidebar` em `src/components/preferences/preferences-store.ts`; os dois precisam mudar juntos.

**Estado atual.** Prontos: auth, usuários, auditoria, perfil (com aniversário), o shell, uploads, **clientes** (cadastro com logo, público-alvo, texto rico, arquivamento e cofre de senhas) e **trabalhos** (lista no formato da planilha, status configuráveis, briefing, histórico de status e mensagens com anexos, @menções e não lidas). A tela inicial (`/`) ainda não mostra nada dos trabalhos.

**Next 16 neste projeto.** `cacheComponents` e `partialPrefetching` ligados em `next.config.ts`. Tipos globais `LayoutProps<"/">`/`PageProps`. Tailwind 4 entra pelo loader `@tailwindcss/turbopack` (não existe config do PostCSS).
