<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Projeto: Workboard

Sistema interno da agência (Double One) para controle de trabalhos. UI e mensagens em pt-BR.

- **Auth:** Better Auth com plugin `admin`, sem cadastro público. Config em `src/lib/auth.ts` (sem `server-only`, pois o seed importa). Em Server Components/Actions use `getSession`/`requireSession` de `src/lib/session.ts`; sempre revalide a sessão perto do dado, o `src/proxy.ts` é só otimista.
- **Cache Components ativo:** quem lê sessão/headers/cookies fica dentro de `<Suspense>`; não faça `await` de sessão no topo de layouts.
- **Banco:** Drizzle + Neon HTTP (`src/db`). Ao mudar `src/db/schema`, rode `npm run db:generate` e versione a migration em `drizzle/`. As chaves das tabelas do Better Auth precisam continuar em camelCase iguais aos campos dele.
- **Validação:** Zod 4 (`z.email()`, `z.url()`, `z.flattenError`, `z.prettifyError`). Schemas compartilhados em `src/lib/validations/`. Variáveis de ambiente validadas em `src/env.ts`.
- **UI:** shadcn/ui (estilo `base-nova`, sobre Base UI, não Radix: composição via prop `render`, não `asChild`). Adicione componentes com `npx shadcn@latest add <nome>`. Fonte Inter via `next/font`.
- **Visual:** dashboard minimalista. Neutros + uma cor de destaque (`--primary`), bordas finas, sem gradientes, blur, glow ou sombras pesadas. Texto de navegação 13px, rótulos `text-xs text-muted-foreground`. Use tokens (`bg-background`, `text-muted-foreground`, `border`), nunca cores fixas.
- **Shell:** `src/components/shell/` (`AppShell`, sidebar, header, menu do usuário). Novos itens de menu vão em `nav-config.ts`. Tooltips com `<Hint>` (`src/components/hint.tsx`).
- **Preferências** (tema claro/escuro/sistema, cor de destaque, sidebar recolhida): `localStorage`, aplicadas no `<html>` (`.dark`, `data-accent`, `data-sidebar`) por um script antes da pintura (`src/lib/preferences.ts`) e lidas no React via `usePreferences()`. Estilos da sidebar recolhida usam a variante `sidebar-collapsed:`. Novas cores de destaque: adicione em `ACCENTS` e um bloco `[data-accent=...]` no `globals.css`, conferindo contraste ≥ 4.5:1 do texto do botão.
- **Ações de admin:** só por Server Actions (`src/app/(app)/usuarios/actions.ts`), que revalidam o admin, validam com Zod, chamam `auth.api.*` e auditam. Os endpoints HTTP `/admin/*` do Better Auth ficam desligados (`disabledPaths` em `src/lib/auth-config.ts`). Ações que invalidam credenciais (senha, desativar) encerram as sessões do alvo; sobre a própria conta, nunca derrubar a sessão atual nem permitir se desativar/rebaixar.
- **Ações destrutivas:** irreversíveis (excluir) usam `<HoldToConfirmButton>` (segurar para confirmar) dentro de um AlertDialog; reversíveis (desativar) usam confirmação simples. Excluir usuário mantém a auditoria: `actor_id` vira null e nome/e-mail ficam copiados no evento. Quando outras tabelas referenciarem usuários (ex.: trabalhos), decida no FK entre `set null` e bloquear a exclusão.
- **Auditoria:** tabela `audit_log` genérica (ator, ação, entidade, `metadata` jsonb). Registre com `recordAudit()` de `@/server/audit` depois da operação dar certo; ele nunca lança erro. Ações novas entram no catálogo `src/lib/audit.ts` (rótulo + categoria) e, se tiverem campos novos em `metadata.changes` (`{ campo: { from, to } }`), em `AUDIT_FIELD_LABELS`. Para histórico de um registro (ex.: um trabalho), use `entity: { type, id, label }` e `listAuditLogs(db, { entity })`. Nunca registre senhas, tokens ou links de reset. Eventos de login/logout/reset são registrados pelos hooks do Better Auth.
- **E-mail:** `sendEmail()` em `src/lib/email`. Hoje imprime no terminal em dev e falha em produção; o SMTP (nodemailer) entra trocando só esse módulo e `isEmailConfigured()`.
- **Testabilidade:** `createAuth({ database })` e as queries em `src/server/*` recebem o `Database` por parâmetro, então dá para rodar contra PGlite em scripts de verificação.
- **Checagens:** `npm run lint`, `npm run typecheck`, `npm run build`.
