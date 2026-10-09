<?php
// Funções compartilhadas por upload.php e delete.php. Não é acessado direto
// (o .htaccess bloqueia). Compatível com PHP 7.4+.
//
// Tokens: "<payload>.<assinatura>", ambos em base64url sem padding. A
// assinatura é HMAC-SHA256 de "<finalidade>.<payload>" com o segredo
// compartilhado com o Workboard (MEDIA_SIGNING_SECRET). Mesmo formato de
// src/server/media/token.ts: mudou lá, mude aqui.

declare(strict_types=1);

const MEDIA_TOKEN_VERSION = 1;

// Extensões aceitas e o grupo de cada uma. Mantenha em sincronia com
// MEDIA_TYPES em src/lib/media.ts.
const MEDIA_EXTENSIONS = [
    'jpg' => 'image', 'jpeg' => 'image', 'png' => 'image', 'webp' => 'image', 'gif' => 'image', 'avif' => 'image',
    'pdf' => 'document', 'doc' => 'document', 'docx' => 'document', 'xls' => 'document', 'xlsx' => 'document',
    'ppt' => 'document', 'pptx' => 'document', 'txt' => 'document', 'csv' => 'document',
    'mp4' => 'video', 'mov' => 'video', 'webm' => 'video', 'mp3' => 'video', 'wav' => 'video', 'm4a' => 'video',
    'zip' => 'design', 'rar' => 'design', '7z' => 'design', 'psd' => 'design', 'ai' => 'design', 'eps' => 'design',
];

// Conteúdos recusados seja qual for a extensão (detectados pelo próprio arquivo).
const MEDIA_BLOCKED_TYPES = [
    'text/html', 'application/xhtml+xml', 'image/svg+xml', 'text/xml', 'application/xml',
    'application/javascript', 'text/javascript', 'application/x-javascript',
    'text/x-php', 'application/x-php', 'application/x-httpd-php',
    'text/x-shellscript', 'application/x-sh', 'text/x-perl', 'text/x-python',
    'application/x-dosexec', 'application/x-msdownload', 'application/x-executable', 'application/x-elf',
];

// pasta/ano/mês/aleatório-nome.ext (ex.: trabalhos/2026/10/k3j9x0q2m8w1a7zc-briefing.pdf)
const MEDIA_KEY_PATTERN = '~^[a-z0-9-]+/\d{4}/\d{2}/[a-z0-9]{16}-[a-z0-9-]{1,60}\.([a-z0-9]{2,5})$~';

function media_config(): array
{
    static $config = null;
    if ($config !== null) {
        return $config;
    }
    $file = __DIR__ . '/config.php';
    $loaded = is_file($file) ? require $file : null;
    if (!is_array($loaded) || !is_string($loaded['secret'] ?? null) || strlen($loaded['secret']) < 32) {
        media_fail(500, 'not_configured', 'Servidor de arquivos sem config.php ou com secret curto (mínimo 32 caracteres).');
    }
    $config = $loaded;
    return $config;
}

function media_json(int $status, array $body): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function media_fail(int $status, string $code, string $message): void
{
    media_json($status, ['ok' => false, 'code' => $code, 'error' => $message]);
}

function media_b64url_encode(string $data): string
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function media_b64url_decode(string $data): ?string
{
    $padded = strtr($data, '-_', '+/');
    $padded .= str_repeat('=', (4 - strlen($padded) % 4) % 4);
    $decoded = base64_decode($padded, true);
    return $decoded === false ? null : $decoded;
}

function media_hmac(string $purpose, string $body): string
{
    return media_b64url_encode(hash_hmac('sha256', $purpose . '.' . $body, media_config()['secret'], true));
}

function media_sign(string $purpose, array $payload): string
{
    $json = json_encode(['v' => MEDIA_TOKEN_VERSION] + $payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    if ($json === false) {
        media_fail(500, 'sign_failed', 'Não foi possível assinar a resposta.');
    }
    $body = media_b64url_encode($json);
    return $body . '.' . media_hmac($purpose, $body);
}

/** Payload do token se a assinatura confere e ele não expirou; senão encerra com 401. */
function media_require_token(string $purpose, $token): array
{
    $parts = is_string($token) ? explode('.', $token) : [];
    if (count($parts) !== 2 || !hash_equals(media_hmac($purpose, $parts[0]), $parts[1])) {
        media_fail(401, 'invalid_token', 'Autorização inválida.');
    }
    $json = media_b64url_decode($parts[0]);
    $payload = $json === null ? null : json_decode($json, true);
    if (!is_array($payload) || ($payload['v'] ?? null) !== MEDIA_TOKEN_VERSION) {
        media_fail(401, 'invalid_token', 'Autorização inválida.');
    }
    if (!is_int($payload['exp'] ?? null) || $payload['exp'] < time()) {
        media_fail(401, 'expired_token', 'A autorização expirou. Tente de novo.');
    }
    return $payload;
}

/** Extensão do caminho, se ele segue o padrão e a extensão é aceita; senão null. */
function media_key_extension($key): ?string
{
    if (!is_string($key) || !preg_match(MEDIA_KEY_PATTERN, $key, $match)) {
        return null;
    }
    return isset(MEDIA_EXTENSIONS[$match[1]]) ? $match[1] : null;
}

function media_path(string $key): string
{
    return __DIR__ . '/uploads/' . $key;
}

/** CORS para o navegador do Workboard (origens em config.php) e resposta ao preflight. */
function media_cors(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $allowed = media_config()['allowed_origins'] ?? [];
    if ($origin !== '' && is_array($allowed) && in_array($origin, $allowed, true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Access-Control-Allow-Methods: POST, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type');
        header('Access-Control-Max-Age: 600');
    }
    header('Vary: Origin');
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}
