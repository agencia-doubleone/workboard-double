# Planejamentos no portal do cliente: plano

> **Situação:** Fases A, B e C prontas na branch (as migrations `0023` e `0024` rodaram no banco de teste, ainda não em produção). Escrito em 19/10/2026 e refinado em 21/10/2026. A branch `feat/planejamentos-no-portal` sai da `main` (o portal do cliente já entrou nela). Substitui a seção 5 de `docs/portal-do-cliente.md`.
> As decisões tomadas com a agência estão em **Decisões**, no fim. Não há perguntas em aberto.

## Objetivo

Levar a aprovação dos planejamentos de redes sociais para dentro do Workboard:

- o cliente **acompanha** o planejamento dele no portal;
- aprova **post a post** (ou tudo de uma vez) ou pede alterações em cada post, com comentário;
- as **artes** sempre passam pelo cliente; a **pauta** (o texto) passa antes só nos planejamentos marcados com "Aprovar pauta";
- vê as artes numa **apresentação** na própria plataforma (o layout do PDF de hoje: arte de um lado, copy e hashtags do outro) e num **feed do Instagram simulado**;
- sem gerar PDF: o cliente vê tudo pelo portal.

## Como é hoje

- **Equipe** (`/planejamentos`): um planejamento por cliente, contínuo mês a mês. Cada mês tem status, "conceito editorial" e posts. O post tem data, rede, tipo (estático, carrossel, reels, Stories, vídeo), headline, texto de apoio, copy, CTA, hashtags, slides (carrossel/Stories), cenas (Reels/Vídeo) e observações. A importação por JSON preenche os posts a partir do Word.
- **Status** (`PLANNING_STATUSES`: em produção, aguardando aprovação, ajustes pedidos, aprovado, finalizado) no mês e em cada post, **independentes e manuais**. Eles alimentam o progresso do mês, a aba de planejamentos dos Relatórios, os avisos aos responsáveis (`notifyPlanningStatus`) e as conquistas ("Aprovado de Primeira" depende de `planning_month.adjustmentsRequestedAt`; finalizar o mês comemora).
- **Aprovação do cliente:** fora do sistema. A agência monta um PDF de apresentação e manda por WhatsApp ou e-mail. Em alguns clientes, antes das artes, manda a pauta (o texto) para aprovar.
- **O post não tem arte:** nenhum arquivo ligado a ele.

### O PDF de apresentação (modelo em `docs/apresentacao-planejamentos.pdf`)

Fica como referência de layout; o sistema não gera PDF.

- Capa com o logo da Double One, depois "Planejamento redes sociais · Maio 2026". No fim, a página de contato da agência.
- **Um post por página**, na ordem das datas, com "apresentação • Planejamento Redes Sociais" e o logo na margem direita.
- **Estático:** a arte (4:5) à esquerda; à direita, "Copy:" com a legenda e, abaixo, as hashtags.
- **Carrossel:** **todos os slides lado a lado** numa grade (3 em cima, 2 embaixo), não um slide por vez; a copy à direita.
- **Stories:** só a arte (9:16) no centro, sem copy.
- Não mostra data, rede, headline nem o conceito do mês.

## Visão geral

```
Equipe                                   Cliente (portal)
──────                                   ────────────────
Escreve/importa os posts (pauta)
[só com "Aprovar pauta"]
"Enviar pauta para aprovação"   ──────►  Vê a pauta do mês
                                         Aprova ou pede alteração por post (ou "Aprovar tudo")
Ajusta o que voltou e reenvia   ◄──────  Envia as respostas
Sobe as artes
"Enviar artes para aprovação"   ──────►  Vê as artes: apresentação ou feed simulado
                                         Aprova ou pede alteração por post (ou "Aprovar tudo")
Ajusta e reenvia                ◄──────  Envia as respostas
Post aprovado: pronto para publicar
```

Sem "Aprovar pauta", o fluxo começa direto nas artes.

## Conceitos

- **"Aprovar pauta"** (`planning.approvesBrief`, decidido, D9): opção do planejamento, no formulário de criar e de editar, desligada por padrão. Texto de ajuda: "O cliente aprova o texto dos posts antes das artes." Marcada nos clientes que aprovam a pauta; nos outros, a etapa de pauta não existe (nem no portal, nem nos selos da equipe).
- **Etapa:** `pauta` (headline, texto de apoio, slides ou roteiro, copy, CTA e hashtags) ou `arte` (os arquivos, com a legenda final).
- **A legenda na etapa de arte** (decidido, D10): depois da pauta aprovada, a equipe ainda pode revisar copy, CTA e hashtags enquanto produz a arte, **sem tirar a aprovação da pauta**. O cliente aprova a legenda final junto com a arte, e a apresentação marca "Legenda revisada desde a pauta" (com o texto aprovado na pauta para comparar). Headline, texto de apoio, slides e roteiro continuam na regra do D5.
- **Situação do post em cada etapa:**
  - Pauta (só com "Aprovar pauta"): `rascunho` (ainda não foi ao cliente) → `enviada` → `aprovada` ou `alteracoes` (o cliente pediu) → a equipe ajusta e reenvia → `enviada`…
  - Arte: `sem_arte` → `pronta` (subiu, ainda não foi ao cliente) → `enviada` → `aprovada` ou `alteracoes` → …
- **Regra das artes:** com "Aprovar pauta", nenhuma arte sobe num post sem a pauta aprovada. Sem isso, o editor mostra o aviso ("A pauta deste post ainda não foi aprovada"). Sem "Aprovar pauta", a arte sobe a qualquer momento.
- **Ligar ou desligar "Aprovar pauta" depois:** vale para o que ainda não aconteceu. Ligar não tira arte que já subiu nem envio que já foi; os posts sem arte passam a precisar da pauta. Desligar faz os posts com pauta pendente saírem da etapa (envios de pauta pendentes são retirados, com confirmação: "3 posts estão com o cliente na pauta; eles saem do portal").
- **Envio:** o que a equipe manda de uma vez para o cliente: um mês, uma etapa, os posts escolhidos e um recado opcional em texto rico. Gera o aviso no sino do portal e o e-mail para quem aprova. **Pode haver vários envios pendentes ao mesmo tempo** (decidido, D12), inclusive de pauta e de arte no mesmo mês; cada post só está em um envio pendente por etapa.
- **Resposta:** a decisão sobre um post numa etapa (aprovar ou pedir alteração com comentário obrigatório). Vem de um contato do portal ou é **registrada por um admin em nome do cliente**, nas duas etapas (decidido, D13: o cliente respondeu por WhatsApp; fica "registrado por Ana"). Fica no histórico do post.

## Lado da equipe (`/planejamentos/[slug]`)

**No formulário do planejamento** (`planning-form.tsx`, novo e editar): a opção "Aprovar pauta".

**No card de cada post** (`month-workspace.tsx`):
- Selos de situação: "Pauta: …" (só com "Aprovar pauta") e "Arte: …".
- Miniatura da arte (ou da capa, no Reels).
- O último comentário do cliente em destaque quando há alteração pedida, com o histórico completo no post.

**No editor do post** (`post-editor.tsx`), uma seção **Artes**, conforme o tipo:

| Tipo | O que sobe | Observação |
|------|------------|------------|
| Estático | 1 imagem | Decidido (D16): uma só; opções viram dois posts ou uma alteração |
| Carrossel | 2 a 20 imagens, na ordem | Arrastar para ordenar; o Instagram aceita até 20 |
| Reels | 1 vídeo + 1 capa (imagem) | A capa vai no feed simulado |
| Stories | 1 ou mais imagens ou vídeos, na ordem | Fora do feed (aparecem só na apresentação) |
| Vídeo (YouTube etc.) | 1 vídeo + 1 capa (thumbnail) | |

- Os arquivos sobem na hora para o CDN (pasta `planejamentos`, nova em `MEDIA_FOLDERS`), como os anexos das mensagens.
- Formatos: imagens JPG/PNG/WebP; vídeo MP4 (o `.mov` sobe, mas nem todo navegador toca: avisar).
- Limites atuais do CDN: 25 MB por imagem e 500 MB por vídeo (`MEDIA_TYPES`).
- Trocar o **tipo** de um post que já tem arte pede confirmação e descarta as artes que não valem no tipo novo.

**Post que está com o cliente** (enviado, esperando resposta; decidido, D11): os campos que o cliente vê ficam travados no editor, com o botão **"Retirar do envio para editar"**, que tira só aquele post do envio (o resto do envio continua com o cliente). As observações internas continuam editáveis.

**No mês:**
- **"Enviar pauta para aprovação"** (só com "Aprovar pauta") e **"Enviar artes para aprovação"** abrem um dialog. Ele lista os posts que podem ir: na pauta, os que estão em rascunho ou com alteração já ajustada; nas artes, os que têm arte pronta. Todos vêm marcados e dá para desmarcar. Há também um campo de recado. O botão fica apagado quando não há o que enviar.
- **Registrar resposta do cliente** (só admins), no post ou em vários de uma vez: aprovar ou pedir alteração em nome do cliente, na etapa em que o post está.
- **Prévia da apresentação** e **prévia do feed**: as mesmas telas do portal, para a equipe conferir antes de enviar (com os posts ainda não enviados também).
- **Filtro** dos posts: todos, com alteração pedida, esperando o cliente, aprovados.

**Mudar um post já aprovado** (decidido, D5):
- Editar headline, texto de apoio, slides, roteiro ou o tipo de uma pauta aprovada, ou trocar a arte aprovada, ou mexer na legenda de uma arte aprovada, pede confirmação ("Isso tira a aprovação do cliente: o post volta para ser enviado de novo"). Confirmado, a etapa volta para `rascunho` (pauta) ou `pronta` (arte) e o status do post volta para "Em produção".
- **A data e a rede não tiram a aprovação** (decidido, D14): a troca fica no histórico do post ("Data mudou de 05/11 para 07/11") e o cliente vê a data nova.
- As observações internas e o status manual nunca tiram a aprovação.
- Admins têm também **"Salvar sem tirar a aprovação"**, para correções pequenas (erro de digitação). Fica no histórico do post ("Editado depois de aprovado, por Ana"), para o cliente não ser surpreendido.
- Mexer na pauta de um post com arte aprovada tira as duas aprovações (a arte foi aprovada com aquele texto).

**Importar e excluir** (decidido, D15):
- **"Substituir"** na importação por JSON passa a apagar **só os posts que nunca foram ao cliente e não têm arte**. Os outros ficam, e a prévia avisa ("5 posts já foram ao cliente e ficam no mês").
- **Excluir um post** que já foi ao cliente pede confirmação. Ele some do portal; se estava num envio pendente, o envio segue sem ele. As artes saem do CDN.

## Lado do cliente (portal)

**Menu:** item "Planejamento" no portal, que só aparece se o cliente tem planejamento (`planning.clientId`) com algum mês enviado.

**Página** `/portal/planejamento` (`?mes=AAAA-MM`):
- **Meses e posts (decidido, D4):** o cliente vê **só o que foi enviado**. O mês aparece no portal no primeiro envio (`planning_month.sharedAt`) e mostra apenas os posts que já foram a ele, na etapa em que foram; o que está em produção fica invisível. Ao abrir, vai para o mês com algo esperando aprovação; sem isso, o mais recente enviado.
- **Topo:** o mês, o conceito editorial, o progresso ("8 de 12 posts aprovados") e o que espera o cliente ("Artes: 4 para aprovar").
- **Aprovar tudo:** aprova todos os posts que esperam resposta na etapa atual. Só para quem pode aprovar (`portal_user.canApprove`, o mesmo das entregas).
- **Quatro abas** (decidido, D21): **Pauta**, **Apresentação**, **Feed** e **Lista**. Abre na Pauta quando há pauta esperando resposta; senão, na Apresentação.
  0. **Pauta:** todos os posts enviados, como a equipe vê o mês: um card por post com a data, a rede, o formato, a headline, o texto de apoio, a legenda (copy, CTA e hashtags) e os slides ou o roteiro. A resposta fica no rodapé dos que esperam a pauta; os que já estão na arte têm o aviso "Já com a arte".
- A Apresentação e o Feed são só dos posts na etapa de arte; a Lista tem todos:
  1. **Apresentação** (o PDF de hoje, na plataforma). Um título "Planejamento redes sociais · Novembro 2026" e, abaixo, **um post por bloco**, na ordem das datas, como as páginas do PDF:
     - **Estático:** a arte à esquerda; à direita, a copy (legenda e CTA) e as hashtags, e os botões de resposta.
     - **Carrossel:** **todos os slides numa grade**, como no PDF; clicar num slide abre o lightbox na ordem, com setas.
     - **Reels e Vídeo:** o vídeo com a capa à esquerda (toca ali mesmo) e a copy à direita.
     - **Stories:** só as artes (9:16), sem copy, lado a lado na ordem.
     - Um rodapé discreto no bloco com a data, a rede e o formato (o PDF não tem, mas ajuda a achar o post).
     - **Na etapa de pauta**, no lugar da arte vão a headline, o texto de apoio e os slides ou o roteiro.
     - No celular, a arte fica em cima e a copy embaixo.
  2. **Feed** (Instagram simulado): o perfil com o logo e o nome do cliente (e o @, tirado do Instagram cadastrado no cliente) e a grade de 3 colunas. Os posts do mês vêm do mais novo para o mais antigo, com os ícones de carrossel e Reels. No Reels aparece a capa. A grade usa o recorte vertical que o Instagram usa hoje no perfil (3:4; conferir na hora de implementar). Clicar abre o post como no Instagram (arte, legenda e as respostas). Só entram os posts da rede Instagram; os ainda sem arte aparecem como um quadro com a headline. **Abaixo dos posts do mês** (decidido, D7), os de arte aprovada dos meses anteriores, mais apagados e sem botões. Como só existem artes a partir do lançamento, essa parte começa vazia e vai enchendo mês a mês (não haverá importação de artes antigas).
  3. **Lista** (compacta): todos os posts com a data, o tipo e a situação, para achar rápido o que falta.
- **Post aberto:** a arte em tamanho grande (no `<MediaLightbox>` que já existe), a legenda, as respostas e o histórico de comentários daquele post.
- **O que o cliente nunca vê:** posts que não foram enviados, as observações internas do post (`notes`), os status internos, os responsáveis e as artes ainda não enviadas.

**Respostas** (decidido, D2: rascunho + "Enviar respostas", como nas entregas):
- Quem pode aprovar responde cada post: aprovar ou pedir alteração (comentário obrigatório), e desfazer enquanto for rascunho.
- As respostas ficam em **rascunho**: os contatos do cliente veem (e podem completar ou mudar o que o outro marcou), a equipe não.
- **"Enviar respostas"** manda à equipe tudo o que já foi respondido, de todos os envios pendentes, **sem precisar responder todos**: o que ficou sem resposta continua esperando no portal. Tem um campo de **recado geral** opcional (decidido, D17), que vai junto no aviso da equipe e fica no histórico do mês. A equipe recebe um aviso só por "Enviar respostas".
- **Depois de enviada, a resposta não se desfaz pelo portal** (D17). Se o cliente mudar de ideia, fala com a equipe, que tira a aprovação pelo D5 ou registra a resposta nova (D13).
- **"Aprovar tudo"** marca como aprovados os posts que ainda não têm resposta e já envia (com confirmação: "Aprovar os 9 posts que faltam e enviar as respostas?"). Os que o cliente já marcou com alteração continuam com alteração.
- Aprovar comemora com os confetes, que já respeitam "Comemorar aprovações".
- Um envio é fechado quando todos os posts dele têm resposta enviada (ou saíram dele). A equipe pode retirar o envio inteiro enquanto nenhuma resposta dele foi enviada, ou um post só (D11).

**Início do portal:** o card "Para aprovar" passa a listar também "Pauta de novembro: 12 posts" e "Artes de novembro: 8 posts", e os números do topo contam esses envios.

## Avisos

- **Portal (sino e e-mail):** ao enviar a pauta ou as artes, os contatos ativos do cliente recebem no sino (tipos novos `planning.brief` e `planning.art`). Quem pode aprovar recebe também o e-mail, como o da entrega para aprovar.
- **Equipe (sino):** quando o cliente envia as respostas, avisam os **responsáveis** do planejamento (`planning_member`, os ativos); se ele não tiver nenhum, os **admins** ativos (decidido, D8). Nunca quem fez. Um aviso por "Enviar respostas" ("Cliente respondeu 5 posts de novembro: 3 aprovados, 2 com alteração"), com o recado geral, se houver.
- Respostas registradas por um admin (D13) avisam os responsáveis como qualquer mudança de status, e não avisam o portal.
- Mudanças que o cliente não precisa saber (editar post não enviado, status interno) não avisam o portal.

## Status, relatórios e conquistas

- Decidido (D3): a aprovação **move o status do post sozinha**:
  - enviar (pauta ou arte) → "Aguardando aprovação";
  - alteração pedida → "Ajustes pedidos";
  - **pauta aprovada → "Em produção"** (agora é a vez da arte);
  - arte aprovada → "Aprovado".
- E o do mês:
  - vai para "Aguardando aprovação" no primeiro envio;
  - vai para "Ajustes pedidos" quando o cliente pede alguma alteração, gravando `adjustmentsRequestedAt`, do qual depende "Aprovado de Primeira";
  - vai para "Aprovado" quando todos os posts têm a arte aprovada.
- "Finalizado" continua manual, da equipe (com a comemoração de hoje).
- O status continua editável à mão (D3), para os meses antigos e para quem segue aprovando por fora; o próximo evento de aprovação sobrescreve o que foi posto à mão.
- **Conquistas:** respostas do cliente não contam conquista nem comemoração para ninguém da equipe. `onPlanningMonthStatus` usa o autor e precisa ignorar o ator `external`. "Aprovado de Primeira" passa a valer de verdade: o mês que chegou a "Aprovado" sem nenhuma alteração pedida.
- **Relatórios** (depois): tempo até a aprovação, rodadas por post, posts aprovados de primeira.

## Arquivos (CDN)

- Pasta `planejamentos`. As artes entram em `listMediaLibrary` (uso novo `planning-art`). Sem isso, a limpeza da tela de Arquivos apagaria as artes.
- **Versões** (decidido, D6): trocar uma arte depois de "alteração pedida" guarda a anterior no histórico do post (`planning_post_asset.version`), para o comentário do cliente continuar fazendo sentido. Depois da aprovação, a equipe tira as versões antigas do CDN com um botão ("Excluir as versões anteriores", no post ou no mês), como nas entregas: o vínculo fica com `mediaId` null e o nome copiado, e o histórico continua.
- Excluir um post ou o planejamento apaga as artes dele do CDN, como as solicitações fazem com os anexos.
- O portal só lê as artes. O cliente não sobe arquivo no planejamento.

## Modelo de dados (rascunho)

Tudo aditivo (ver **Migration sem perda de dados**). A migration `0023` (Fase A) criou `approvesBrief`, os campos de pauta e arte do post, `planning_post_asset`, `planning_review` (com `sendId` ainda sem chave estrangeira) e `planning_post_event`. `sharedAt`, `planning_send`, `planning_send_post`, `planning_answer` e as mudanças em `portal_notification` entram com a Fase C, numa migration própria, também aditiva.

| Tabela | O quê |
|--------|-------|
| `planning` | + `approvesBrief` (boolean, `default false`, not null) |
| `planning_month` | + `sharedAt` (null; primeira vez que algo do mês foi ao cliente; o portal só lista meses com ela) |
| `planning_post` | + `briefState` (`default 'rascunho'`), `briefDecidedAt`, `briefDecidedByName`, `briefDecidedBySide` (team/client); + `artState` (`default 'sem_arte'`), `artDecidedAt`, `artDecidedByName`, `artDecidedBySide`; + `briefCaption` (jsonb null: copy, CTA e hashtags como estavam na aprovação da pauta, para a comparação do D10) |
| `planning_post_asset` | `id`, `postId` (cascade), `mediaId` (set null, como nas rodadas), `name` copiado, `role` (`art`, `cover`), `position`, `version`, `createdById`, `createdAt` |
| `planning_send` | `id`, `monthId` (cascade), `stage` (`pauta`/`arte`), `note` (texto rico), `status` (`pending`, `answered`, `withdrawn`), `sentById`/`Name`/`At`, `answeredAt` |
| `planning_send_post` | `sendId`, `postId`, `state` (`pending`, `answered`, `withdrawn`): os posts de cada envio; índice único parcial em `(postId, stage)` com `state = 'pending'` garante um envio pendente por post e etapa (D12) |
| `planning_review` | `id`, `postId`, `sendId` (null quando é resposta registrada por admin), `stage`, `decision` (`approved`/`changes`), `comment`, `side` (`client`/`team`), `portalUserId`/`userId` (set null), `name` copiado, `createdAt`, `submittedAt` (null = rascunho, ainda não enviada à equipe) |
| `planning_answer` | `id`, `monthId`, `note` (o recado geral do D17), `portalUserId` (set null), `name` copiado, `createdAt`: um por "Enviar respostas" |
| `planning_post_event` | o histórico do post que não é resposta: data trocada, editado depois de aprovado, retirado do envio, arte trocada (formato como `RequestEventData`) |
| `portal_notification` | tipos novos `planning.brief`, `planning.art`; `clientRequestId` passa a aceitar null e entra `planningMonthId` (cascade), com um check de que só um dos dois está preenchido |
| `notification` | tipo novo `planning.answered` (a tabela já tem `planningId`) |

- **Índices:** `planning_review (postId, stage, createdAt)` e `planning_send (monthId, stage, status)`.
- **Regras** em `src/lib/planning.ts`: estados, quem pode o quê e `canUploadArt(post, planning)` (que olha `approvesBrief`).
- **Consultas** em `src/server/planning.ts` e num `src/server/planning-approvals.ts` novo, sem `server-only`, para serem testáveis com PGlite.

## Migration sem perda de dados

A migration roda contra o banco de produção (Neon), com os planejamentos que a equipe já usa. Regras:

- **Só aditiva:** `CREATE TABLE`, `ADD COLUMN` com `default` ou aceitando null, `CREATE INDEX`, e `DROP NOT NULL` em `portal_notification.client_request_id`. **Nenhum** `DROP TABLE`, `DROP COLUMN`, `RENAME` ou `ALTER ... TYPE` em coluna existente. Nenhum `UPDATE` ou `DELETE` de dados existentes.
- **Revisar o SQL gerado** pelo `npm run db:generate` linha a linha antes de versionar: o drizzle-kit às vezes transforma uma mudança de nome em "apagar e criar" (o que perderia a coluna). Se aparecer qualquer `DROP` fora do esperado, para e corrige o schema.
- **Como os dados de hoje ficam:**
  - planejamentos existentes ficam com "Aprovar pauta" desligada (a equipe liga nos clientes que precisam);
  - posts existentes ficam com a pauta em `rascunho` e a arte em `sem_arte`, **com o status atual intacto** (o status manual não é recalculado);
  - meses existentes ficam sem `sharedAt`, ou seja, **nada aparece no portal** até o primeiro envio;
  - as notificações do portal que já existem continuam com `clientRequestId` preenchido e passam no check.
- **Ensaio antes da produção:** rodar a migration num **branch do Neon criado a partir da produção** (cópia instantânea, sem mexer na produção), conferir as contagens de `planning`, `planning_month`, `planning_post` e `portal_notification` antes e depois, e abrir o Workboard apontado para esse branch. Só então rodar `npm run db:migrate` na produção.
- **Rede de segurança:** anotar o horário antes de migrar; o Neon restaura o banco num ponto no tempo (dentro da janela de retenção do plano) se algo der errado.
- **Teste com PGlite:** o script de verificação aplica todas as migrations sobre um banco com planejamentos, meses, posts e notificações do portal já cadastrados no formato antigo e confere que nada mudou neles.

## Rotas e arquivos

```
src/app/(portal)/portal/planejamento/page.tsx        o mês (abas Apresentação | Feed | Lista)
src/app/(portal)/portal/planejamento/actions.ts      responder post, aprovar tudo, enviar respostas
src/components/planning/                             peças comuns à equipe e ao portal:
  planning-views.tsx                                 as abas (Apresentação | Feed | Lista) e a lista compacta
  post-presentation.tsx                              a apresentação (um post por bloco, como o PDF)
  instagram-feed.tsx                                 grade do feed simulado + post aberto
  post-parts.tsx                                     legenda, pauta e a linha de data/rede/formato
  planning-icons.tsx                                 ícones de rede e de tipo
  types.ts / present.ts                              tipos de view (tudo aqui o cliente pode ver)
src/app/(app)/planejamentos/[slug]/previa/page.tsx   a prévia da equipe
src/app/(app)/planejamentos/                         equipe: "Aprovar pauta" no formulário, artes no editor,
                                                     envios, registrar resposta, prévias
src/server/planning-approvals.ts                     envios, respostas, estados
src/lib/validations/planning-approvals.ts
```

O portal segue as regras de sempre:
- o `clientId` sai da sessão do contato;
- o planejamento é buscado por `clientId`, nunca por slug vindo da URL;
- os tipos de view não carregam campo interno.

## Segurança

- [ ] Toda consulta e action do portal parte de `requirePortalSession()` e filtra o planejamento pelo `clientId` da sessão. Post, envio e arte são sempre carregados junto do planejamento do cliente.
- [ ] O portal só enxerga posts que já foram enviados, e só a etapa enviada. A arte que ainda não foi enviada não aparece, mesmo com o id do arquivo.
- [ ] `canApprove` conferido no servidor para responder, "Aprovar tudo" e "Enviar respostas".
- [ ] A resposta só vale para o post pendente num envio pendente (condição no `update … where`, como em `decideDeliveryFile`): post retirado ou envio retirado recusa.
- [ ] Registrar resposta em nome do cliente: só admins.
- [ ] Teste com PGlite: o contato do cliente A não vê nem responde nada do cliente B; post não enviado não aparece; sem `canApprove` não aprova; a resposta a um envio ou post retirado é recusada; com "Aprovar pauta", arte sem pauta aprovada é recusada; sem "Aprovar pauta", a arte sobe; "Substituir" na importação não apaga post enviado.

## Fases

Cada fase vai para produção sozinha. O cliente só vê alguma coisa na Fase C (decidido, D18): as Fases A e B não mostram nada no portal.

**Fase A: artes e pauta, só na equipe**
- [x] Migration `0023` (só aditiva, conferida com PGlite sobre dados no formato antigo). Falta o ensaio no branch do Neon e rodar em produção.
- [x] "Aprovar pauta" no formulário, `planning_post_asset`, seção Artes no editor (envio na hora, ordem por arrastar, capa do Reels e do vídeo), selos e miniaturas nos cards.
- [x] Estado da pauta, "Aprovar a pauta" (admin, no post, no editor e o mês inteiro) e desfazer, a regra de subir arte, a confirmação do D5, "Substituir" protegendo os posts com arte ou pauta aprovada.
- [x] `listMediaLibrary` (uso `planning-art`), exclusão das artes junto com post, mês ou planejamento.

**Fase B: as telas do portal, como prévia da equipe**
- [x] Apresentação, feed e lista em `src/components/planning/` (`PlanningViews`, com `renderActions` e `renderStatus` para o portal pôr as respostas na Fase C), usadas pela página `/planejamentos/[slug]/previa?mes=` (botão "Prévia" no mês). A prévia mostra todos os posts do mês, cada um na etapa em que está (a arte, quando já subiu; senão, a pauta). Sem o Instagram cadastrado no cliente, o feed mostra o nome dele no lugar do @.

**Fase C: aprovação pelo portal**
- [x] Migration `0024` (só aditiva): `planning_send`, `planning_send_post` (com a situação de antes, para retirar, e a versão da arte enviada), `planning_answer`, `sharedAt`, o rascunho único por post do envio em `planning_review`, e `portal_notification` com `planningMonthId` (um dos dois alvos, conferido no banco).
- [x] Equipe: "Enviar para aprovação" (pauta ou artes, posts escolhidos, recado), a faixa dos envios que esperam com "Retirar envio", "Retirar do envio para editar", "Registrar resposta do cliente" (admins, aprovar ou pedir alteração, nas duas etapas), a alteração pedida em destaque no card e o histórico no editor.
- [x] Portal: item "Planejamento" no menu (só com algum mês enviado), `/portal/planejamento?mes=` com as três abas, a resposta por post (rascunho compartilhado), "Enviar respostas" com recado geral, "Aprovar tudo", confetes. O cliente vê só os posts enviados, na versão da arte que foi enviada.
- [x] Sino do portal (`planning.brief`, `planning.art`) e e-mail para quem aprova; sino da equipe (`planning.answered`, responsáveis ou admins); "Para aprovar" no início do portal.
- [x] Status automáticos (`applyDecisions` em `src/server/planning-sends.ts`). A mais do plano: quando nada mais espera o cliente e ainda falta arte aprovada, o mês volta de "Aguardando aprovação" para "Em produção". "Aprovado de Primeira" vale quando o mês chega a "Aprovado" pelas respostas (a conquista é dos responsáveis, não de quem respondeu).
- Limite conhecido: a pauta que o cliente vê é o texto atual do post (não uma cópia do que foi enviado); a arte, sim, é a versão enviada.

**Fase D: acabamento**
- [ ] Limpeza das versões antigas, relatórios de aprovação, ajustes com o uso real.

## Decisões

Tomadas com a agência em 19/10/2026 (D1 a D8) e 21/10/2026 (D9 em diante).

| # | Decisão |
|---|---------|
| D1 | ~~A pauta aprovada vale para todo cliente; admins aprovam as pautas dos outros de uma vez.~~ Substituída pela D9. |
| D2 | Respostas do cliente em **rascunho** até "Enviar respostas" (como nas entregas), aceitando envio parcial. "Aprovar tudo" aprova o que falta e envia. |
| D3 | A aprovação **move os status** do post e do mês sozinha; "Finalizado" continua manual e tudo segue editável à mão. |
| D4 | O cliente vê **só o que foi enviado**: o mês aparece no primeiro envio, com os posts enviados. |
| D5 | Mudar um post aprovado (texto ou arte) **pede confirmação e tira a aprovação**. Admins podem "Salvar sem tirar a aprovação" em correções pequenas. |
| D6 | Versões anteriores das artes ficam no histórico; depois da aprovação, a equipe as **exclui do CDN com um botão**. |
| D7 | O feed simulado mostra, **abaixo do mês**, os posts aprovados dos meses anteriores (começa vazio; sem importar artes antigas). |
| D8 | As respostas do cliente avisam os **responsáveis** do planejamento; sem responsável, os **admins**. |
| D9 | **"Aprovar pauta"** é uma opção do planejamento, marcada ao criar ou editar, desligada por padrão. Só com ela existe a etapa de pauta e a arte depende da pauta aprovada; sem ela, o cliente aprova só as artes. |
| D10 | Depois da pauta aprovada, a **legenda** (copy, CTA, hashtags) pode ser revisada sem tirar a aprovação; o cliente aprova a legenda final junto com a arte, vendo o que mudou. |
| D11 | Post enviado e esperando resposta fica **travado**; "Retirar do envio para editar" tira só aquele post. |
| D12 | **Vários envios pendentes** ao mesmo tempo (pauta e arte no mesmo mês inclusive); um post só está em um envio pendente por etapa. |
| D13 | Admins **registram a resposta do cliente** (aprovar ou pedir alteração) nas duas etapas, quando ele respondeu por fora. |
| D14 | Trocar a **data** ou a **rede** não tira a aprovação; fica no histórico e o cliente vê o valor novo. Observações internas e status manual também não tiram. Trocar o **tipo** tira (muda slides e roteiro). |
| D15 | **"Substituir"** na importação só apaga os posts que nunca foram ao cliente e não têm arte. Excluir um post enviado pede confirmação. |
| D16 | Toda a equipe envia para o cliente. Estático tem **uma** imagem. Outras redes ficam só na Apresentação (sem prévia própria); cada post continua com uma rede só. |
| D17 | "Enviar respostas" tem um **recado geral** opcional. Resposta enviada não se desfaz pelo portal. |
| D18 | O cliente só vê o planejamento no portal na Fase C, já podendo aprovar. Antes disso, as telas servem de prévia para a equipe. |
| D19 | A **apresentação segue o PDF de hoje**, na plataforma e sem gerar PDF: um post por bloco, arte à esquerda e copy com hashtags à direita, carrossel com todos os slides em grade, Stories só com a arte. |
| D20 | A migration é **só aditiva** e passa por um ensaio num branch do Neon antes da produção: nenhum dado existente muda ou some. |
| D22 | Nos planejamentos com "Aprovar pauta", o post tem **um status só, com a etapa**: "Pauta · Em produção / Aguardando aprovação / Ajustes pedidos", "Arte · …", "Aprovado", "Finalizado" (no banco, o status de sempre; a etapa sai da pauta aprovada). Trocar de etapa à mão (admins) aprova ou desfaz a pauta. Os selos "Pauta:"/"Arte:" saíram do card. |
| D21 | No portal, abas **Pauta** (cards com o texto, como a equipe vê o mês, de todos os posts enviados), **Apresentação** e **Feed** (só as artes) e **Lista** (todos). |
