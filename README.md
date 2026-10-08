# Workboard

Sistema interno da agência para controle dos trabalhos.

**Stack:** Next.js 16 (App Router, Cache Components) · Neon (Postgres) · Drizzle ORM · Better Auth (plugin admin) · Zod · Tailwind 4 + shadcn/ui · Inter

## Primeiros passos

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Crie um projeto no [Neon](https://console.neon.tech) e copie a connection string **pooled**.

3. Copie `.env.example` para `.env.local` (se ainda não existir) e preencha:

   | Variável | O que é |
   | --- | --- |
   | `DATABASE_URL` | Connection string do Neon |
   | `BETTER_AUTH_SECRET` | Segredo de 32+ caracteres (`npx auth secret`) |
   | `BETTER_AUTH_URL` | URL do app (`http://localhost:3000` em dev) |
   | `SEED_ADMIN_PASSWORD` | Senha inicial do `admin@doubleone.com.br` (mín. 8) |
   | `SEED_ADMIN_NAME` | Nome exibido do admin (opcional) |

4. Crie as tabelas e o admin:

   ```bash
   npm run db:migrate
   npm run db:seed
   ```

5. Rode o projeto e entre em http://localhost:3000 com `admin@doubleone.com.br`:

   ```bash
   npm run dev
   ```

## Scripts

| Script | Descrição |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm run db:generate` | Gera migration a partir de `src/db/schema` |
| `npm run db:migrate` | Aplica as migrations pendentes no banco |
| `npm run db:studio` | Abre o Drizzle Studio |
| `npm run db:seed` | Cria o admin (idempotente: não altera senha se já existir) |

## Estrutura

```
src/
  app/
    (auth)/               Telas públicas: login e redefinir-senha
    (app)/                Área autenticada (shell + páginas)
    (app)/usuarios/       Gestão de usuários (admin) + Server Actions
    (app)/auditoria/      Trilha de auditoria (admin)
    api/auth/[...all]/    Rotas do Better Auth
  components/
    shell/                Sidebar, header, menu do usuário, nav-config.ts
    preferences/          Store de tema / cor / sidebar (localStorage)
    ui/                   Componentes shadcn/ui
    hint.tsx              Tooltip com atalho de teclado
  db/
    schema/               Tabelas Drizzle (auth.ts = tabelas do Better Auth)
    index.ts              Cliente Drizzle (Neon HTTP)
  lib/
    auth-config.ts        Configuração do Better Auth (hooks de auditoria, reset)
    auth.ts               Instância do Better Auth ligada ao banco
    audit.ts              Catálogo de ações de auditoria
    email/                Envio de e-mails (dev: terminal; SMTP no roadmap)
    auth-client.ts        Cliente do Better Auth (navegador)
    session.ts            getSession / requireSession para Server Components
    validations/          Schemas Zod
    preferences.ts        Temas de cor e script anti-flash de tema
  server/                 Consultas e gravação no banco (usuários, auditoria)
  env.ts                  Validação das variáveis de ambiente
  proxy.ts                Redireciona para /login quando não há cookie de sessão
scripts/seed.ts           Seed do admin
drizzle/                  Migrations geradas
```

## Autenticação

- Não há cadastro público (`disableSignUp`). Usuários são criados pelo admin em **Usuários**, que também troca senha, envia link de redefinição, encerra sessões, desativa/reativa e exclui contas. Ao criar, a senha pode ficar em branco: o sistema gera uma e a mostra uma única vez.
- Trocar a senha ou desativar encerra as sessões da pessoa. A redefinição pelo link também encerra todas as sessões ao salvar a nova senha.
- Toda ação de admin e todo login/logout/falha de login ficam em **Auditoria**.
- Em desenvolvimento, o e-mail de redefinição é impresso no terminal do `npm run dev` (com o link). Em produção, o envio fica indisponível até o SMTP ser configurado.
- `proxy.ts` faz só uma checagem otimista do cookie. A validação de verdade é `requireSession()`, que deve ser chamada em toda página, Server Action e Route Handler que acessa dados.
- Com Cache Components, componentes que leem a sessão precisam ficar dentro de `<Suspense>`.
- O rate limit do login fica no banco (tabela `rate_limit`), para funcionar entre instâncias serverless.

## Deploy na Vercel

1. Importe o repositório na Vercel.
2. Em **Settings → Environment Variables**, cadastre `DATABASE_URL`, `BETTER_AUTH_SECRET` e `BETTER_AUTH_URL` (a URL de produção, ex.: `https://workboard.doubleone.com.br`).
3. Rode `npm run db:migrate` apontando para o banco de produção antes do primeiro deploy (e a cada nova migration).

> O login só funciona na origem configurada em `BETTER_AUTH_URL`. Preview deployments (`*.vercel.app`) vão recusar o login até configurarmos isso.
