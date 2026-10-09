# CDN de arquivos (KingHost)

Recebe os uploads do Workboard e serve os arquivos em `https://cdn.doubleone.com.br/uploads/...`. O navegador envia direto para cá, porque a Vercel limita cada requisição a 4.5 MB; o Workboard só assina a autorização (`/api/media/sign`) e registra o arquivo depois (`/api/media/complete`).

| Arquivo | Função |
| --- | --- |
| `upload.php` | Recebe o arquivo com o token assinado e devolve um recibo assinado |
| `delete.php` | Apaga um arquivo; só o servidor do Workboard chama |
| `lib.php` | Assinatura, validações e CORS (bloqueado para a web) |
| `config.example.php` | Modelo do `config.php` (secret e origens permitidas) |
| `.htaccess` | Bloqueia `lib.php`, `config.php` e a listagem da pasta |
| `uploads/.htaccess` | Arquivos públicos por link, sem listagem, sem executar scripts, com cache longo |
| `.user.ini` | Limites de upload do PHP (512 MB) |

## Instalação

1. No painel da KingHost, crie o subdomínio `cdn.doubleone.com.br` e ative o SSL.
2. Envie por FTP o conteúdo desta pasta para a raiz do subdomínio, **incluindo os arquivos ocultos** (`.htaccess`, `.user.ini`, `uploads/.htaccess`). O README não precisa ir.
3. No servidor, copie `config.example.php` para `config.php` e preencha:
   - `secret`: gere com `openssl rand -base64 48`. O mesmo valor vai em `MEDIA_SIGNING_SECRET` no Workboard;
   - `allowed_origins`: a URL de produção do Workboard e `http://localhost:3000`.
4. Confira se a pasta `uploads/` aceita escrita pelo PHP (permissão 755 costuma bastar).
5. No painel, confira: PHP 7.4 ou mais novo, extensão `fileinfo` ativa e, se o `.user.ini` não valer, `upload_max_filesize = 512M` e `post_max_size = 520M`.
6. No `.env.local` e na Vercel, defina `MEDIA_CDN_URL=https://cdn.doubleone.com.br` e `MEDIA_SIGNING_SECRET`.
7. Rode `npm run cdn:check` no Workboard. Ele envia uma imagem de teste, confere recibo, CORS e proteções, e apaga o arquivo no fim.

## Ao mudar algo

- **Tipos aceitos:** `MEDIA_TYPES` em `src/lib/media.ts` **e** `MEDIA_EXTENSIONS` em `lib.php`.
- **Formato do token:** `src/server/media/token.ts` e `lib.php`, juntos.
- **Trocar o secret:** mude no `config.php` e nas variáveis do Workboard ao mesmo tempo. Envios em andamento falham e precisam ser refeitos.
