# Tempo real (Cloudflare Workers)

Este Worker entrega na hora as notificações e as mensagens do chat do Workboard, e é a sala ao vivo dos quadros brancos (quem está no quadro, cursores e o que cada um desenha). Ele fica fora da Vercel porque a Vercel não mantém conexões abertas (websocket).

O Worker **não guarda nada e não acessa o banco**. O Workboard grava tudo no Neon e depois avisa o Worker, que repassa o aviso para as abas abertas de cada pessoa. Nos quadros, cada navegador grava o próprio desenho no Workboard e a sala só repassa o que muda para quem está no mesmo quadro. Se o Worker cair, nada se perde: o Workboard volta a se atualizar de tempos em tempos.

> **Já usa o tempo real e acabou de atualizar o Workboard com os quadros brancos?** Publique o Worker de novo (`npm run deploy` nesta pasta) e rode `npm run realtime:check` na raiz: a parte "Sala do quadro branco" precisa passar. Sem isso, os quadros funcionam, mas as mudanças dos outros aparecem a cada 10 segundos em vez de na hora.

```
 Navegador ──(1) pede um token──────────────▶ Vercel  /api/realtime/token
 Navegador ◀═(2) websocket (fica aberto)═══▶ Worker  /connect
 Vercel ────(3) "avise a Ana"────────────────▶ Worker  /publish  ──▶ abas da Ana
```

Tempo estimado: 20 a 30 minutos. Você precisa de:

- uma conta no Cloudflare (gratuita, sem cartão);
- acesso ao projeto do Workboard na Vercel;
- um terminal na pasta do projeto (PowerShell ou o terminal do VS Code).

> Os nomes de menus abaixo são os do painel do Cloudflare em outubro de 2026. Se algum mudou de lugar, procure pelo mesmo nome na barra de busca do painel.

---

## Passo 1 · Criar a conta no Cloudflare

1. Acesse **https://dash.cloudflare.com/sign-up**.
2. Preencha e-mail e senha e clique em **Sign up**.
3. Abra o e-mail de confirmação que o Cloudflare manda e clique no link.
4. Se o painel oferecer para **adicionar um domínio** ("Add a domain" / "Onboard a domain"), **pule**. Não precisamos de domínio.

### Escolher o seu subdomínio `workers.dev` (opcional agora)

Todo Worker ganha um endereço do tipo `https://NOME-DO-WORKER.SEU-SUBDOMINIO.workers.dev`. O "seu subdomínio" é escolhido uma vez por conta:

1. No menu lateral, clique em **Workers & Pages**. Em algumas contas ele fica dentro de **Compute (Workers)**.
2. À direita aparece **Your subdomain**, com um botão **Change** ao lado.
3. Digite algo como `doubleone` e confirme. O Worker vai ficar em `https://workboard-realtime.doubleone.workers.dev`.

Se pular isso, o terminal pergunta o subdomínio na primeira publicação (passo 5).

---

## Passo 2 · Instalar as dependências do Worker

O Worker tem as próprias dependências, separadas das do Workboard. Na raiz do projeto:

```powershell
cd realtime
npm install
```

Avisos `allow-scripts` sobre `esbuild` e `workerd` podem ser ignorados. Os demais comandos deste tutorial rodam **dentro da pasta `realtime`**, exceto quando o passo disser o contrário.

---

## Passo 3 · Conectar o terminal à sua conta

```powershell
npx wrangler login
```

1. O navegador abre numa página do Cloudflare perguntando se o Wrangler pode acessar sua conta.
2. Confira se é a conta certa (canto superior) e clique em **Allow**.
3. A página mostra que já pode fechar a aba. No terminal aparece **Successfully logged in**.

Para conferir:

```powershell
npx wrangler whoami
```

Ele mostra o seu e-mail e o nome da conta.

> **O navegador não abriu?** Rode `npx wrangler login --browser=false`, copie o link que aparece no terminal e abra no navegador.

---

## Passo 4 · Dizer quais endereços podem conectar

Abra `realtime/wrangler.jsonc` e edite a linha `ALLOWED_ORIGINS`. Ela recebe o endereço do Workboard em produção e o endereço local, separados por vírgula:

```jsonc
"vars": {
  "ALLOWED_ORIGINS": "https://workboard.doubleone.com.br,http://localhost:3000"
},
```

`https://workboard.doubleone.com.br` é só um exemplo: use o endereço real em que a equipe abre o Workboard. Regras:

- é o **mesmo valor do `BETTER_AUTH_URL` de produção**: protocolo e domínio, **sem barra no fim** e sem caminho;
- se o Workboard abre em mais de um endereço (ex.: com e sem `www`), coloque os dois;
- os deploys de preview da Vercel (`...-git-....vercel.app`) têm outro endereço e ficam de fora. Neles o tempo real não liga, e o resto funciona normalmente, com recarga periódica.

> **Edite sempre aqui, não no painel.** Variáveis mudadas no painel do Cloudflare são sobrescritas no próximo `npm run deploy`.

---

## Passo 5 · Publicar o Worker

Ainda na pasta `realtime`:

```powershell
npm run deploy
```

- Se você não escolheu o subdomínio no passo 1, ele pergunta agora. Digite um nome (ex.: `doubleone`) e confirme.
- No fim aparece o endereço do Worker, algo como:

  ```
  https://workboard-realtime.doubleone.workers.dev
  ```

  **Copie esse endereço:** ele será o `REALTIME_URL`.

Abra o endereço no navegador. Deve aparecer **"Workboard: tempo real no ar."**

> Nos primeiros minutos depois do primeiro deploy, o endereço pode dar erro 523 ou não abrir. Espere um ou dois minutos e tente de novo.

No painel, em **Workers & Pages**, agora aparece o **workboard-realtime**.

---

## Passo 6 · Criar o segredo

O segredo é a senha que o Workboard e o Worker usam entre si. O mesmo valor vai em três lugares: no Worker, no `.env.local` e na Vercel.

1. Gere um segredo novo. Na raiz do projeto ou em qualquer pasta, rode:

   ```powershell
   node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
   ```

   Copie o texto que aparece e **guarde num gerenciador de senhas**.

2. Grave no Worker (dentro da pasta `realtime`):

   ```powershell
   npx wrangler secret put REALTIME_SECRET
   ```

   Quando aparecer **Enter a secret value**, cole o segredo e aperte Enter. O Worker é atualizado na hora.

**Alternativa pelo painel**, caso o terminal não aceite colar:

1. **Workers & Pages** → clique em **workboard-realtime**.
2. Aba **Settings** → seção **Variables and Secrets** → **Add**.
3. Em **Type**, escolha **Secret**. Em **Variable name**, escreva `REALTIME_SECRET` e, em **Value**, cole o segredo.
4. Clique em **Deploy**.

Segredos não são apagados pelo `npm run deploy`, ao contrário das variáveis comuns.

---

## Passo 7 · Testar a partir do seu computador

1. Na **raiz do projeto**, adicione ao `.env.local`:

   ```env
   REALTIME_URL="https://workboard-realtime.doubleone.workers.dev"
   REALTIME_SECRET="o mesmo segredo do passo 6"
   ```

2. Rode a verificação (na raiz do projeto, não em `realtime`):

   ```powershell
   npm run realtime:check
   ```

   Ela conecta no Worker como uma pessoa de teste, publica um aviso e confere se ele chegou. Também testa as proteções. No fim, deve mostrar tudo com ✔ e a mensagem **"Tempo real pronto para uso."** Se algo falhar, a própria mensagem diz o que revisar (veja também [Problemas comuns](#problemas-comuns)).

   A verificação testa a origem do `BETTER_AUTH_URL` do `.env.local` (normalmente `http://localhost:3000`). Para testar também o endereço de produção no PowerShell:

   ```powershell
   $env:BETTER_AUTH_URL="https://workboard.doubleone.com.br"; npm run realtime:check; Remove-Item Env:BETTER_AUTH_URL
   ```

3. **Reinicie o `npm run dev`**: variáveis novas só valem depois de reiniciar.

4. Teste no app com duas pessoas: abra o Workboard num navegador normal e numa janela anônima, logado em contas diferentes. Mande uma mensagem no **Chat**: ela deve aparecer na hora para a outra pessoa, e "digitando…" aparece enquanto você escreve.

---

## Passo 8 · Configurar na Vercel

1. Acesse **https://vercel.com**, abra o projeto do Workboard e vá em **Settings** → **Environment Variables**.
2. Adicione as duas variáveis:

   | Key | Value | Environments |
   | --- | --- | --- |
   | `REALTIME_URL` | `https://workboard-realtime.doubleone.workers.dev` | só **Production** |
   | `REALTIME_SECRET` | o segredo do passo 6 | só **Production** |

   Deixe **Preview** e **Development** desmarcados: os previews não estão em `ALLOWED_ORIGINS` e ficariam tentando conectar à toa.

3. Clique em **Save**.
4. As variáveis só valem em deploys novos. Vá em **Deployments**, abra o menu **⋯** do deploy de produção mais recente e clique em **Redeploy**. Também vale fazer um deploy novo pelo Git.

> **Banco:** as tabelas do chat e das notificações vêm da migração `0007_chat_and_notifications`. Se a produção usa o mesmo Neon do `.env.local`, o `npm run db:migrate` que você já rodou basta. Se usa outro banco, rode a migração nele também.

---

## Passo 9 · Conferir em produção

1. Abra o Workboard em produção e aperte **F12** para abrir as ferramentas do navegador.
2. Vá na aba **Network** (Rede) e clique no filtro **WS** (ou **Socket**).
3. Recarregue a página. Deve aparecer uma linha **`connect?token=...`** com status **101**.
4. Clique nela e abra **Messages** (Mensagens). A cada 25 segundos aparecem um `ping` e um `pong`, e os avisos chegam por ali.

Para ver os acessos ao Worker ao vivo, rode na pasta `realtime`:

```powershell
npx wrangler tail
```

O painel do Cloudflare também guarda os acessos recentes: **Workers & Pages** → **workboard-realtime** → aba **Logs** (ou **Observability**).

---

## Custos e limites

O plano gratuito do Workers inclui os Durable Objects com SQLite (o tipo que este Worker usa). Os limites diários do plano gratuito que importam aqui:

- **100.000 requisições por dia.** Cada conexão aberta conta como uma. As mensagens que chegam ao Worker contam 1 a cada 20, o que inclui o `ping` de cada aba a cada 25 segundos. Cada aviso do Workboard (`/publish`) conta como uma.
- **Duração:** com a hibernação, o Worker praticamente não acumula tempo enquanto as conexões estão paradas.

Conta de exemplo: 20 pessoas com 2 abas abertas o dia inteiro dão cerca de 3.000 requisições de `ping` por dia, mais as conexões e os avisos. Fica bem abaixo do limite.

Nos quadros brancos, só os coletivos entram na sala (o pessoal não usa o Worker). Quem mexe o mouse com outra pessoa no mesmo quadro manda até 20 posições de cursor por segundo (sozinho no quadro, nada vai). Uma hora de duas pessoas desenhando juntas dá cerca de 7.000 requisições. Enquanto alguém desenha, o Worker fica acordado e conta tempo de duração, ainda longe do limite gratuito para o uso de uma agência.

Os limites zeram às **21h** de Brasília (00:00 UTC). Se algum dia estourar, o tempo real para até a virada, e o Workboard continua funcionando com recarga periódica. Nenhuma notificação ou mensagem se perde.

---

## Domínio próprio (opcional)

Para usar algo como `realtime.doubleone.com.br`, o DNS de `doubleone.com.br` precisaria estar no Cloudflare, trocando os nameservers que hoje estão na KingHost. Isso mexe no site, no e-mail e no CDN, então **não vale a pena só para isso**. O endereço `workers.dev` funciona igual, e ninguém da equipe o vê: ele só aparece por trás, na conexão do navegador.

---

## Desenvolvimento local (sem publicar)

Para mexer no Worker sem publicar:

1. Copie `.dev.vars.example` para `.dev.vars` e defina um `REALTIME_SECRET` qualquer, com 32 caracteres ou mais.
2. `npm run dev`: o Worker sobe em `http://localhost:8787`.
3. No `.env.local` do Workboard: `REALTIME_URL=http://localhost:8787` e o mesmo `REALTIME_SECRET`. Reinicie o `next dev`.
4. `npm run realtime:check` (na raiz) confere a ligação.

---

## Problemas comuns

| O que aparece | Causa provável | O que fazer |
| --- | --- | --- |
| `realtime:check`: **Token recusado** | O segredo do `.env.local` é diferente do gravado no Worker | Repita o passo 6 com o mesmo valor nos dois lugares |
| `realtime:check`: **Origem recusada** | O endereço do app não está em `ALLOWED_ORIGINS` | Corrija `wrangler.jsonc` (passo 4) e rode `npm run deploy` |
| `realtime:check`: **O Worker não respondeu** | `REALTIME_URL` errado, ou o deploy não terminou | Abra o endereço no navegador; deve aparecer "tempo real no ar" |
| `realtime:check`: **Defina REALTIME_URL e REALTIME_SECRET** | Faltam as variáveis no `.env.local` | Passo 7, item 1 |
| No app, nada aparece no filtro **WS** do F12 | A Vercel está sem as variáveis, ou não houve redeploy | Na aba Network, `/api/realtime/token` responde **503**: refaça o passo 8 |
| No F12, `connect` aparece com erro ou **403** | O endereço de produção não está em `ALLOWED_ORIGINS` | Passo 4 e `npm run deploy` |
| O sino só atualiza a cada minuto | O websocket não está conectado (veja as linhas acima) | Siga o passo 9 para achar onde parou |
| Notificação do Windows não aparece | Permissão não dada, ou o Workboard está na frente | Ative pelo sino. Elas só aparecem quando nenhuma aba do Workboard está em foco. Confira também o "Não perturbe" do Windows e as notificações do navegador em **Configurações** → **Sistema** → **Notificações** |
| `wrangler login` não abre o navegador | — | `npx wrangler login --browser=false` e abra o link manualmente |

---

## Ao mudar algo

- **Protocolo** (`src/lib/realtime/protocol.ts`): o Next e o Worker usam o mesmo arquivo. Depois de mudar, publique o Worker de novo (`npm run deploy` nesta pasta) junto com o deploy do Workboard.
- **Checagem de tipos:** `npm run typecheck` nesta pasta. O `npm run typecheck` da raiz não olha o Worker.
- **Trocar o segredo:** grave o novo no Worker (passo 6), no `.env.local` e na Vercel (com redeploy). Enquanto os três não batem, os avisos em tempo real param e o app segue com recarga periódica.
- **Rotas do Worker:** `GET /connect?token=...` (navegador; token de 1 minuto assinado pelo Workboard), `GET /board?token=...` (sala de um quadro branco; o token diz a pessoa e o quadro), `POST /publish`, `POST /disconnect` e `POST /board/disconnect` (servidor do Workboard, com `Authorization: Bearer <REALTIME_SECRET>`). Todas as conexões ficam num Durable Object só (`Hub`), com a API de hibernação.
