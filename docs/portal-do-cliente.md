# Portal do cliente: plano

> **Situação (17/10/2026):** fase 1 (acesso) pronta: contatos na página do cliente, login por código no e-mail, o shell do Workboard no portal (sidebar, tema claro/escuro e cor de destaque) e o perfil do contato (nome e foto). Fase 2 quase toda pronta: solicitações dos dois lados, com conversa, previsão de entrega, andamento e avisos no sino (o que mudou em relação ao plano está no início da seção 2). Fase 3 pronta em 19/10/2026: entregas para aprovação, o sino do portal e o e-mail de entrega (seções 3 e 6). Também em 19/10/2026: "Criar trabalho" a partir da solicitação, as solicitações no Início dos admins e o início do portal refeito. Escrito em 13/10/2026 a partir da conversa sobre a área dos clientes.
> As decisões em aberto estão no fim, com a recomendação de cada uma. Resolva-as antes da fase em que elas entram.

## Objetivo

Dar aos clientes da agência uma área própria no Workboard onde eles:

- fazem **solicitações** (pedidos de trabalho) e acompanham o andamento;
- recebem **entregas para aprovação** e aprovam ou pedem ajustes;
- **conversam** com a agência sobre cada solicitação;
- (fase posterior) aprovam os **planejamentos** de redes sociais post a post.

Princípio que guia tudo: **o cliente só vê o que a equipe mandou para ele.** Trabalhos, briefings, mensagens internas, status internos e pessoas da equipe continuam invisíveis.

## Decisões já tomadas

1. **Login separado.** Um segundo setup do Better Auth, com tabelas e cookie próprios. O cliente nunca é um `user` do time.
   Motivo: hoje 34 lugares do código tratam "estar logado" como "ser da agência" (ex.: as actions de planejamentos aceitam qualquer sessão), e 13 consultas listam todos os `user` (menções, aniversários, seletores de pessoas, relatórios, conquistas). Com o cliente na mesma tabela, qualquer lugar esquecido vazaria dados ou daria acesso. Com o login separado, a sessão do cliente simplesmente não existe para o resto do sistema.
2. **Vários contatos por cliente**, gerenciados por admins na página do cliente (`/clientes/[slug]`).
3. **Solicitação é diferente de trabalho.** O trabalho continua interno da agência. A solicitação é o que o cliente vê: tem status próprios, conversa própria e é por ela que vão os arquivos para aprovação.
4. **A equipe tem uma tela de solicitações** e, a partir de uma solicitação, um botão **"Criar trabalho da solicitação"**, que cria um trabalho já vinculado a ela (pode haver mais de um trabalho por solicitação).

## Conceitos

| Termo | O que é |
|---|---|
| **Contato** | Pessoa do cliente com acesso ao portal (`portal_user`). Pertence a um cliente. |
| **Solicitação** | Pedido feito pelo cliente (ou aberto pela equipe em nome dele). Tem número próprio (`S-12`, para não confundir com o PIT), status do portal e conversa. |
| **Entrega** | Uma rodada de aprovação dentro da solicitação: arquivos + recado da equipe. O cliente aprova ou pede ajustes. Rodadas numeradas (v1, v2...). |
| **Conversa** | Mensagens entre o cliente e a equipe dentro da solicitação. Tudo ali o cliente vê. Conversa interna continua no trabalho vinculado. |
| **Trabalho vinculado** | Trabalho interno criado a partir da solicitação (`job.clientRequestId`). O cliente não vê o trabalho. |

## 1. Acesso e autenticação

### Segundo Better Auth

- Factory nova, no molde de `createAuth` (`src/lib/auth-config.ts`): `createPortalAuth({ database, baseURL, secret })` em `src/lib/portal-auth-config.ts`, ligada em `src/lib/portal-auth.ts`.
- `basePath: "/api/portal-auth"` (rota `src/app/api/portal-auth/[...all]/route.ts`).
- `advanced.cookiePrefix: "wb-portal"`: cookie diferente do time, então `getSession`/`requireSession` do time nunca enxergam um cliente, e vice-versa.
- Tabelas próprias pelo `modelName` de cada modelo: `portal_user`, `portal_session`, `portal_account`, `portal_verification` (e o rate limit em tabela própria, como o do time, que usa `storage: "database"`).
- **Entrada por código no e-mail** (plugin `email-otp`, com `disableSignUp: true`: só entra quem foi cadastrado). Sem senha para o cliente esquecer. Código e não link porque o e-mail corporativo (Outlook/Office 365) abre os links para escanear, e um link de uso único chegaria vencido. O SMTP já existe (`sendEmail`).
- Sessão longa (sugestão: 30 dias, renovada com o uso), porque o cliente entra pouco.
- Campos adicionais em `portal_user`: `clientId` (FK `client`, `cascade`), `canApprove` (boolean), `disabledAt`, `lastSignInAt`, `invitedAt` e `createdById`.

### Regras de acesso

- `src/lib/portal-session.ts`: `getPortalSession()` e `requirePortalSession()` (redireciona para `/portal/entrar`). A sessão só vale se o contato não estiver desativado **e** o cliente não estiver arquivado. A conferência acontece **a cada request**, não só no login.
- O `clientId` usado em qualquer consulta do portal sai **sempre da sessão**, nunca de parâmetro, formulário ou URL.
- `src/proxy.ts`: hoje o matcher deixa passar só login/esqueci/redefinir. Passa a tratar `/portal/*` à parte: confere o cookie do portal (`getSessionCookie(request, { cookiePrefix: "wb-portal" })`) e manda para `/portal/entrar`; o resto continua igual.
- Desativar contato: grava `disabledAt` e apaga as sessões dele (`portal_session`). Arquivar o cliente derruba todos os contatos dele pela regra acima.

### Contatos na página do cliente (admins)

Card **"Acessos ao portal"** em `/clientes/[slug]`, no padrão do cofre (`credentials-section.tsx`):

- lista: nome, e-mail, "Pode aprovar", último acesso, situação (ativo, convite pendente, desativado);
- **Novo contato** (dialog com chave nova a cada abertura): nome, e-mail, "Pode aprovar". Cria o `portal_user` e manda o **e-mail de convite** com o link de entrada;
- reenviar convite, editar, desativar/reativar, excluir (`HoldToConfirmButton`);
- tudo auditado (`portal_user.created`, `.updated`, `.disabled`, `.deleted`, `.invited`).

## 2. Solicitações

> **Pronto em 17/10/2026, com estas diferenças do plano original:** o cliente escreve **assunto** e **briefing** (texto rico, com imagens), sem tipo, data desejada nem anexos à parte (arquivos vão pela conversa); os status são os da tabela abaixo, definidos com a agência; na equipe, **só admins** veem (sem responsáveis por enquanto); a equipe informa a **previsão de entrega**. "Criar trabalho" ficou pronto em 19/10/2026. Falta: e-mails ao cliente.

### Lado do cliente (`/portal/solicitacoes`)

- **Nova solicitação** (`/portal/solicitacoes/nova`): assunto (vira o título) e briefing no editor de texto rico (imagens sobem pela rota do portal).
- **Lista:** as solicitações do cliente (de todos os contatos dele, inclusive as que a equipe cadastrou), com recortes Em aberto/Encerradas/Todas, busca, status, previsão e mensagens não lidas. O início do portal mostra as abertas (ver "Início do portal", abaixo).
- **Página da solicitação:** briefing, conversa, detalhes (status, previsão, quem abriu) e o **andamento**: trocas de status, previsão informada/alterada/retirada e edições do assunto e do briefing, com quem fez.
- Pode cancelar a própria solicitação **enquanto ela está "Aguardando análise"** (`canClientCancel`; a action só cancela se o status ainda for esse no banco).

### Status da solicitação

Lista fixa em `REQUEST_STATUSES` (`src/lib/client-requests.ts`, espelhada no check do banco). Cada status tem um tom próprio, igual na equipe e no portal: cinza na fila, azul em análise, verde-água no orçamento, âmbar esperando o cliente aprovar, roxo em execução, e verde, vermelho ou apagado quando encerra.

| Chave | Rótulo | Encerra |
|---|---|---|
| `aguardando_analise` | Aguardando análise | |
| `em_analise` | Em análise | |
| `aguardando_orcamento` | Aguardando orçamento | |
| `aguardando_aprovacao` | Aguardando aprovação | |
| `em_execucao` | Em execução | |
| `finalizada` | Finalizada | sim |
| `negada` | Negada | sim |
| `cancelada` | Cancelada | sim |

Pelo portal, toda solicitação nasce em "Aguardando análise"; a equipe, ao cadastrar, escolhe o status. Cada troca vai para `client_request_status_history` com o lado (equipe ou cliente) e o nome copiado.

### Lado da equipe (`/solicitacoes`, só admins)

- Item "Solicitações" no menu de admin, com o número de solicitações com novidade (chegaram, ou têm mensagem do cliente, depois do último "visto" da pessoa).
- **Lista** no molde de Trabalhos: filtros na URL (`busca`, `situacao`, `status`, `cliente`, `porPagina`, `pagina`), status mudando na linha (finalizar solta confetes e o som, como nos trabalhos), previsão em vermelho quando atrasada, selo "Nova", o briefing num modal, o andamento num popover e o menu "…" (abrir, editar, copiar o link do portal, excluir). A lista do portal tem os mesmos botões de briefing e andamento.
- **Nova solicitação** (`/solicitacoes/nova`): a equipe cadastra em nome do cliente (pedido que chegou por WhatsApp ou e-mail): cliente, assunto, status, previsão e briefing (opcional). O cliente vê no portal como aberta pela Double One; os outros admins recebem o aviso no sino.
- **Página** (`/solicitacoes/[numero]`): briefing, conversa, status, previsão (salva sozinha), andamento e os botões copiar link, excluir e editar.
- **Editar** (`/solicitacoes/[numero]/editar`): assunto, briefing, status, previsão e cliente. O cliente só muda enquanto ele não participou (não abriu pelo portal nem escreveu na conversa), para o que ele escreveu não ir parar no portal de outra empresa.
- **Excluir:** apaga de vez, também do portal, com conversa, anexos no CDN, andamento e notificações. O número não volta. As imagens do briefing ficam no CDN e aparecem como sem uso em Arquivos.
- **Atrasada:** previsão antes de hoje (Brasília) num status que não encerra (`isRequestOverdue`): a data fica em vermelho na lista, no início do portal e na página, dos dois lados; a equipe tem também o selo "Atrasada desde…" no topo da página.
- **Andamento:** as trocas de status mais `client_request_event` (previsão informada, trocada ou tirada; assunto ou briefing editados), juntados por `toRequestTimeline`. O cliente vê o mesmo, com "(Double One)" ao lado de quem é da agência.
- **Criar trabalho** (pronto, migration 0022): o botão da página leva a `/trabalhos/novo?solicitacao=<número>` com nome (assunto), cliente (travado), briefing e previsão preenchidos; ao salvar, grava `job.clientRequestId`. O trabalho funciona como qualquer outro e é interno: o cliente não vê. A solicitação tem o card "Trabalhos" com os criados a partir dela, e a página do trabalho mostra a solicitação nos detalhes (com link e status para admins). Excluir a solicitação só desfaz o vínculo. Na busca, "S-12" acha também esses trabalhos.
- **Início dos admins:** a seção "Solicitações dos clientes" (em aberto, na fila, atrasadas, com o cliente; o que espera a equipe e as previsões da semana) e as mensagens não lidas delas em "Precisa de resposta".

### Início do portal (`/portal`)

Refeito em 19/10/2026: a saudação (ou os parabéns no aniversário da empresa) com uma frase do que espera o contato; os números (em aberto, para aprovar, mensagens novas, finalizadas no ano); "Para aprovar" com as miniaturas dos primeiros arquivos de cada rodada; as solicitações em aberto; as próximas previsões de entrega (atrasadas em vermelho); as novidades (os avisos do sino) e o acesso do contato. Cliente sem nenhuma solicitação vê "Como funciona" em três passos.

## 3. Entregas para aprovação

> **Pronto em 19/10/2026.** Decisões da agência: o cliente responde **arquivo por arquivo**; a página tem **abas Entregas | Conversa**; o status muda sozinho, mas quem finaliza é a equipe.

- Na página da solicitação (equipe): **"Enviar para aprovação"** abre um dialog com arquivos (sobem ao CDN na hora, pasta `solicitacoes`; até `DELIVERY_FILES_MAX`) e um recado em texto rico. Cria a rodada seguinte (1, 2...) e muda a solicitação para "Aguardando aprovação".
- Só uma rodada espera resposta por vez: mandar outra marca a anterior como **"Substituída"**. A que ainda espera dá para **retirar** (some do portal, os arquivos saem do CDN).
- O contato com "Pode aprovar entregas" (`canApprove`, no card de acessos) responde **cada arquivo**: Aprovar ou Pedir alteração (comentário obrigatório), e pode desfazer. As respostas ficam em rascunho (os outros contatos do cliente veem; a equipe não) até **"Enviar respostas"**, liberado com todos respondidos. Aí a rodada fecha como "Aprovada" (tudo aprovado) ou "Alterações pedidas", a solicitação volta para "Em execução" e os admins são avisados.
- Contato sem `canApprove` vê a entrega e pode comentar na conversa, mas não responde.
- Histórico das rodadas sempre visível dos dois lados (a mais nova aberta, as anteriores recolhidas, com a resposta de cada arquivo). O andamento registra "Rodada N enviada" e "Rodada N respondida".
- No portal, a página abre na aba Entregas quando uma rodada espera resposta, e o início mostra o card "Para aprovar".
- Imagens e vídeos abrem num **lightbox** (anterior/próximo, zoom com roda do mouse, duplo clique, pinça e "tamanho real"); no portal, aprovar ou pedir alteração dá para fazer de dentro dele.
- Aprovar um arquivo solta **confetes** na tela do cliente (desligável em "Comemorar aprovações", nas Configurações do portal).
- Depois de uma rodada aprovada, a equipe pode **excluir os arquivos das rodadas anteriores** que não foram aprovadas, para liberar o CDN. As rodadas e as respostas ficam como histórico, com o nome de cada arquivo; só a equipe vê o aviso de que eles saíram do servidor (no portal, o card mostra "Arquivo não disponível") (migration 0021).

## 4. Conversa

- Uma conversa por solicitação, visível para o cliente e para a equipe que acessa a solicitação.
- Reaproveita as peças de `src/components/messages/` (compositor, anexos e links). Os caminhos do drive ficam desligados, porque não fazem sentido para o cliente. Anexos na pasta `solicitacoes` do CDN.
- Não lidas por pessoa, dos dois lados (`client_request_read` para a equipe, `client_request_portal_read` para os contatos), no molde de `job_read`. Quem entrou depois (cadastro mais novo que a mensagem) não vê o passado como não lido.
- Na mensagem da equipe, o cliente vê o nome e a foto de quem escreveu.
- Recarrega a cada 15 s com a aba visível e ao enviar; na equipe, também na hora em que chega a notificação dela. Tempo real no portal fica para a fase 5.

## 5. Planejamentos no portal (fase própria)

- No mês do planejamento, a equipe clica em **"Enviar para o cliente"** (`planning_month.sharedAt`). Só meses enviados aparecem no portal.
- O cliente vê os posts (data, rede, formato, tema, headline, copy, seções) e, por post, **aprova** ou **pede ajustes** com comentário (`planning_post_feedback`).
- O post muda de status ("Aprovado"/"Ajustes pedidos") e os responsáveis recebem a notificação de sempre (`notifyPlanningStatus`).
- Cuidados: pedir ajustes precisa gravar `planning_month.adjustmentsRequestedAt` (a conquista "Aprovado de Primeira" depende dele); ações do cliente não podem contar conquista nem comemoração para ninguém da equipe por engano (`onPlanningMonthStatus` usa o autor).
- Hoje o post não tem imagem. Se o cliente precisar ver a arte, o post ganha anexo (e o anexo entra em `listMediaLibrary`).

## 6. Notificações

**Equipe (sino):** prontos `request.created` (o cliente abriu, ou outro admin cadastrou), `request.message` (soma numa notificação só enquanto não lida, índice `notification_open_request_message_idx`) e `request.canceled`, com `notification.clientRequestId`. Recebem os admins ativos, nunca quem fez a ação. Na fase 3 entrou `request.delivery_answered` (o cliente enviou as respostas de uma rodada, com quantos aprovou e em quantos pediu alteração).

**Cliente (pronto):** o **sino do portal** (`portal_notification`), para os contatos ativos do cliente: entrega para aprovar, mensagem da equipe (somam), status, previsão de entrega e solicitação aberta pela equipe. Sem tempo real: o sino reconta a cada 30 s com a aba visível. E-mail só na **entrega para aprovar** (`deliveryForApprovalEmail`, para quem pode aprovar).

**Cliente, e-mails do plano original** (modelos em `src/lib/email/templates.ts`, mesma identidade dos atuais):

- convite (link de entrada);
- entrega aguardando aprovação;
- nova mensagem da agência (agrupada: no máximo um e-mail a cada X minutos por solicitação, e só se o contato não leu);
- solicitação concluída.

No portal, marca de novidade na lista e na página.

## 7. Arquivos

- Pasta nova no CDN: `solicitacoes` (anexos do cliente, arquivos das entregas e anexos da conversa). Mude `MEDIA_TYPES`/`media_extensions()` só se precisar de tipos novos.
- `media` ganha `uploadedByPortalUserId` (FK `portal_user`, `set null`), porque `uploadedById` aponta para `user`.
- O cliente envia por rotas próprias (`/api/portal-media/sign` e `/complete`, prontas), que conferem a sessão do portal. Não misturar com as rotas do time.
- **`listMediaLibrary` precisa conhecer cada lugar novo**, senão a limpeza da tela de arquivos apaga o que o cliente enviou. Já conhece os anexos da conversa e as imagens do briefing (`request-attachment`, `request-briefing`); os arquivos das entregas (fase 3) precisam entrar.
- Os links do CDN são públicos com trecho aleatório, como hoje. Vale avisar a agência que um arquivo enviado ao cliente pode ser aberto por quem tiver o link.

## 8. Auditoria

- Como foi feito: o contato grava como ator `external` (sem `actor_id`, que aponta para `user`), com nome e e-mail copiados no evento; sem coluna nova em `audit_log`.
- Ações no catálogo `src/lib/audit.ts` (categoria "Solicitações"): prontas `client_request.created`, `.status_changed`, `.updated`, `.canceled`, `.message_deleted` e `.deleted`; ficam para depois `.delivery_sent`, `.approved`, `.changes_requested`, `.job_created`.
- A tela de auditoria mostra o contato como autor, marcado como "Cliente".

## 9. Modelo de dados (rascunho)

> **Construído na fase 2 (migrations 0018 e 0019):** `client_request` (assunto e briefing no lugar de `type`/`description`/`desiredDate`; com `expectedOn`, `createdBySide` e `createdById`), `client_request_status_history` (com `changedBySide`, sem copiar o rótulo: os status são fixos), `client_request_event` (o resto do andamento), `client_request_message` (com `authorSide`) e os anexos dela, `client_request_read` e `client_request_portal_read`, e `notification.clientRequestId`. Ainda não: `client_request_member`, `client_request_attachment`, as entregas, `job.clientRequestId` e `audit_log.portalActorId` (não vai precisar).

| Tabela | Colunas principais |
|---|---|
| `portal_user` | campos do Better Auth + `clientId`, `canApprove`, `disabledAt`, `lastSeenAt` |
| `portal_session`, `portal_account`, `portal_verification` | do Better Auth |
| `client_request` | `id`, `number` (identity), `clientId` (restrict), `title`, `type`, `description`, `desiredDate`, `status`, `statusChangedAt`, `createdByPortalUserId` (set null), `createdById` (set null, quando a equipe abre), `createdAt`, `updatedAt` |
| `client_request_member` | `requestId`, `userId` (responsáveis da equipe) |
| `client_request_status_history` | `requestId`, `status`, `label`, `changedById` / `changedByPortalUserId`, `changedByName`, `createdAt` |
| `client_request_attachment` | `requestId`, `mediaId`/`key`, `name`, `size`, `type` |
| `client_request_delivery` | `id`, `requestId`, `round`, `note`, `status` (pending, approved, changes_requested, superseded), `sentById`, `sentAt`, `respondedByPortalUserId`, `respondedAt`, `responseComment` |
| `client_request_delivery_file` | `deliveryId`, `mediaId`/`key`, `name`, `size`, `type`, `position` |
| `client_request_message` | `id`, `requestId`, `authorId` / `authorPortalUserId` (set null), `authorName`, `body`, `createdAt` |
| `client_request_message_attachment` | como `job_message_attachment` |
| `client_request_read` | `requestId`, `userId` ou `portalUserId`, `lastReadAt` |
| `job` | + `clientRequestId` (set null) |
| `planning_month` | + `sharedAt` (fase 5) |
| `planning_post_feedback` | `postId`, `portalUserId`, `decision`, `comment`, `createdAt` (fase 5) |
| `notification` | + `clientRequestId` |
| `media` | + `uploadedByPortalUserId` (pronto, migration 0017) |
| `audit_log` | + `portalActorId` |

Gravações em várias tabelas com `db.batch([...])` e ids gerados no app, como no resto.

## 10. Estrutura de rotas e arquivos

```
src/app/(portal)/portal/                 layout com o shell do Workboard (src/components/portal/), sem nada da equipe
  entrar/page.tsx                        pedir o link por e-mail (público)
  page.tsx                               início (dados; a tela em _home/portal-home-view.tsx)
  solicitacoes/page.tsx                  lista
  solicitacoes/nova/page.tsx             formulário (dentro de <ResetOnNavigation>)
  solicitacoes/[numero]/page.tsx         detalhe, entregas, conversa
  planejamentos/...                      fase 5
  perfil/page.tsx                        nome e foto (pronto); sair fica no menu da conta
  actions.ts                             Server Actions do portal (requirePortalContext)
src/app/(app)/solicitacoes/              tela da equipe (lista, detalhe, actions.ts)
src/app/api/portal-auth/[...all]/route.ts
src/app/api/portal-media/{sign,complete}/route.ts   (pronto: "portal" só imagens, "solicitacoes" qualquer tipo)
src/lib/portal-auth-config.ts, src/lib/portal-auth.ts, src/lib/portal-session.ts
src/lib/client-requests.ts               status, rótulos, regras (compartilhado)
src/lib/validations/client-requests.ts
src/server/client-requests.ts            consultas (recebem Database, testáveis com PGlite)
src/server/portal/                       consultas do portal, que sempre recebem o clientId da sessão
```

O código do portal **nunca importa** actions ou consultas do time sem filtro por cliente. As páginas do portal entregam tipos de view próprios (`present.ts`), nunca a linha do banco inteira (para não vazar campo interno).

## 11. Impactos em outras partes

- **Busca global (Ctrl+K):** pronto. Grupo "Solicitações" (assunto, cliente ou número) e a conversa e os anexos delas nos grupos de mensagens e arquivos, só para admins, como a tela `/solicitacoes`. O portal não tem busca global na primeira versão.
- **Relatórios (depois):** solicitações por cliente, tempo até a primeira entrega, rodadas até aprovar.
- **Calendário:** a data desejada das solicitações abertas pode aparecer (decidir depois).
- **Tempo real (fase 5):** token do portal com outro tipo no `src/lib/realtime/protocol.ts`, tags `portal:<id>` no Worker, eventos `request.updated`/`request.message`. Mudou o protocolo, publique o Worker. Sem tempo real, recarga periódica.

## 12. Segurança: checklist

- [ ] Toda action e consulta do portal começa com `requirePortalContext()` e filtra por `clientId` da sessão.
- [ ] Carregar solicitação/entrega/mensagem sempre por `id` **e** `clientId`.
- [ ] `canApprove` conferido no servidor para aprovar ou pedir ajustes.
- [ ] Contato desativado e cliente arquivado bloqueados em toda request.
- [ ] Nada de dado interno nos tipos de view do portal (trabalho, status interno, mensagens internas, e-mail da equipe).
- [ ] Rate limit no pedido de link de entrada; resposta igual exista ou não o e-mail (como o `/esqueci-a-senha`).
- [ ] Teste com PGlite: contato do cliente A não lê nem altera nada do cliente B; contato desativado não passa; entrega só aparece depois de enviada; sem `canApprove` não aprova.

## 13. Fases

**Fase 1: acesso**
- [x] Segundo Better Auth (tabelas, rota, cookie, código por e-mail, só cadastrados).
- [x] `portal-session.ts`, proxy, `/portal/entrar`, layout do portal e início de boas-vindas.
- [x] Card "Acessos ao portal" na página do cliente, e-mail de convite, auditoria.
- [x] Testes de isolamento com PGlite.
- [x] Shell do Workboard no portal (sidebar recolhível, tema e cor nas Configurações, conta no header) e `/portal/perfil` (nome e foto, envio pelas rotas `/api/portal-media/*`).

**Fase 2: solicitações e conversa**
- [x] Tabelas, status, histórico (sem responsáveis: por enquanto só admins).
- [x] Portal: nova solicitação, lista, detalhe, cancelar enquanto "Aguardando análise".
- [x] Equipe: `/solicitacoes` (lista e detalhe), cadastrar em nome do cliente, editar, excluir, previsão de entrega (atrasada em vermelho) e andamento.
- [x] "Criar trabalho" a partir da solicitação, card nos dois lados e as solicitações no Início dos admins.
- [x] Conversa com anexos e não lidas.
- [x] Notificações no sino; `listMediaLibrary`.
- [x] Busca global (só admins).
- [ ] E-mails ao cliente.

**Fase 3: entregas para aprovação**
- [x] Enviar entrega (rodadas, substituída, retirar), resposta por arquivo com rascunho e "Enviar respostas", histórico, sino do portal e e-mail de entrega.
- [ ] E-mails de mensagem da agência e de solicitação concluída.

**Fase 4: polimento**
- [ ] Relatórios de solicitações, data desejada no calendário, ajustes de texto e visual com o uso real.

**Fase 5: planejamentos e tempo real**
- [ ] Planejamentos no portal (enviar o mês, aprovação por post, `adjustmentsRequestedAt`).
- [ ] Tempo real no portal (mensagens e status ao vivo).

## Decisões em aberto

| # | Pergunta | Recomendação |
|---|---|---|
| 1 | Entrar por link no e-mail ou com senha? | **Decidido:** código de 6 números no e-mail (links de uso único vencem nos scanners do e-mail corporativo). |
| 2 | Um contato pode atender mais de um cliente? | Não na primeira versão: um contato, um cliente (o e-mail é único no `portal_user`). Se precisar, vira tabela de vínculo depois. |
| 3 | Papéis do contato | Só "Pode aprovar" (liga/desliga). |
| 4 | Quem da equipe vê as solicitações? | **Decidido (por enquanto):** só admins. Depois, talvez responsáveis e funcionários dos trabalhos vinculados. |
| 5 | Chat geral por cliente, além da conversa de cada solicitação? | Começar só com a conversa por solicitação; avaliar o geral com o uso. |
| 6 | Endereço: `/portal` ou subdomínio (`clientes.doubleone.com.br`)? | `/portal` no início; o subdomínio pode apontar para ele depois sem mudar código. |
| 7 | Visual: identidade da Double One ou com o logo do cliente? | Identidade da Double One (como as telas públicas) com o logo do cliente no topo. |
| 8 | O status do trabalho mexe no status da solicitação? | Não: a equipe muda o da solicitação (é o que o cliente lê); só entregas e "criar trabalho" mudam sozinhas. |
| 9 | Tipos de solicitação: lista fixa ou livre? | **Decidido:** sem tipo; o cliente escreve o assunto e o briefing. |
| 10 | Descrição: texto simples ou texto rico? | **Decidido:** texto rico, como o briefing dos trabalhos. |
| 11 | E-mail de mensagem: na hora ou agrupado? | **Decidido:** ainda sem e-mail ao cliente. Quando entrar: agrupado e só se não foi lida. |
| 12 | Planejamentos: o mês vira "Aprovado" sozinho quando todos os posts forem aprovados? | Sim, e a equipe ainda pode mudar à mão. |
