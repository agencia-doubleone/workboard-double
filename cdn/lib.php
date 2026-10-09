<?php
// Funções compartilhadas por upload.php e delete.php. Não é acessado direto
// (o .htaccess bloqueia).
//
// Compatível com PHP 5.4+, porque o subdomínio roda PHP 5. Não use
// declare(strict_types), "??", tipos escalares ou de retorno nas funções
// (string, int, bool, ?string, : void...) nem arrays em const: tudo isso é
// PHP 7 e o arquivo inteiro deixa de compilar no servidor.
//
// Tokens: "<payload>.<assinatura>", ambos em base64url sem padding. A
// assinatura é HMAC-SHA256 de "<finalidade>.<payload>" com o segredo
// compartilhado com o Workboard (MEDIA_SIGNING_SECRET). Mesmo formato de
// src/server/media/token.ts: mudou lá, mude aqui.

const MEDIA_TOKEN_VERSION = 1;

// pasta/ano/mês/aleatório-nome.ext (ex.: trabalhos/2026/10/k3j9x0q2m8w1a7zc-briefing.pdf)
const MEDIA_KEY_PATTERN = '~^[a-z0-9-]+/\d{4}/\d{2}/[a-z0-9]{16}-[a-z0-9-]{1,60}\.([a-z0-9]{2,5})$~';

/**
 * Extensões aceitas e o grupo de cada uma. Mantenha em sincronia com
 * MEDIA_TYPES em src/lib/media.ts.
 */
function media_extensions()
{
    return [
        'jpg' => 'image', 'jpeg' => 'image', 'png' => 'image', 'webp' => 'image', 'gif' => 'image', 'avif' => 'image',
        'pdf' => 'document', 'doc' => 'document', 'docx' => 'document', 'xls' => 'document', 'xlsx' => 'document',
        'ppt' => 'document', 'pptx' => 'document', 'txt' => 'document', 'csv' => 'document',
        'mp4' => 'video', 'mov' => 'video', 'webm' => 'video', 'mp3' => 'video', 'wav' => 'video', 'm4a' => 'video',
        'zip' => 'design', 'rar' => 'design', '7z' => 'design', 'psd' => 'design', 'ai' => 'design', 'eps' => 'design',
    ];
}

/** Conteúdos recusados seja qual for a extensão (detectados pelo próprio arquivo). */
function media_blocked_types()
{
    return [
        'text/html', 'application/xhtml+xml', 'image/svg+xml', 'text/xml', 'application/xml',
        'application/javascript', 'text/javascript', 'application/x-javascript',
        'text/x-php', 'application/x-php', 'application/x-httpd-php',
        'text/x-shellscript', 'application/x-sh', 'text/x-perl', 'text/x-python',
        'application/x-dosexec', 'application/x-msdownload', 'application/x-executable', 'application/x-elf',
    ];
}

/** $array[$key] se existir e não for null; senão $default (o "??" do PHP 7). */
function media_get($array, $key, $default = null)
{
    return is_array($array) && isset($array[$key]) ? $array[$key] : $default;
}

/** @return array */
function media_config()
{
    static $config = null;
    if ($config !== null) {
        return $config;
    }
    $file = __DIR__ . '/config.php';
    $loaded = is_file($file) ? require $file : null;
    $secret = media_get($loaded, 'secret');
    if (!is_array($loaded) || !is_string($secret) || strlen($secret) < 32) {
        media_fail(500, 'not_configured', 'Servidor de arquivos sem config.php ou com secret curto (mínimo 32 caracteres).');
    }
    $config = $loaded;
    return $config;
}

function media_json($status, array $body)
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    $flags = JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE;
    if (defined('JSON_INVALID_UTF8_SUBSTITUTE')) {
        $flags |= JSON_INVALID_UTF8_SUBSTITUTE;
    }
    echo json_encode($body, $flags);
    exit;
}

function media_fail($status, $code, $message)
{
    media_json($status, ['ok' => false, 'code' => $code, 'error' => $message]);
}

/** @return string */
function media_b64url_encode($data)
{
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

/** @return string|null */
function media_b64url_decode($data)
{
    $padded = strtr($data, '-_', '+/');
    $padded .= str_repeat('=', (4 - strlen($padded) % 4) % 4);
    $decoded = base64_decode($padded, true);
    return $decoded === false ? null : $decoded;
}

/** @return string */
function media_hmac($purpose, $body)
{
    $config = media_config();
    return media_b64url_encode(hash_hmac('sha256', $purpose . '.' . $body, $config['secret'], true));
}

/** Comparação em tempo constante (hash_equals só existe a partir do PHP 5.6). */
function media_equals($known, $given)
{
    if (!is_string($known) || !is_string($given)) {
        return false;
    }
    if (function_exists('hash_equals')) {
        return hash_equals($known, $given);
    }
    if (strlen($known) !== strlen($given)) {
        return false;
    }
    $diff = 0;
    for ($i = 0, $length = strlen($known); $i < $length; $i++) {
        $diff |= ord($known[$i]) ^ ord($given[$i]);
    }
    return $diff === 0;
}

/** @return string */
function media_sign($purpose, array $payload)
{
    $flags = JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE;
    if (defined('JSON_INVALID_UTF8_SUBSTITUTE')) {
        $flags |= JSON_INVALID_UTF8_SUBSTITUTE;
    }
    $json = json_encode(['v' => MEDIA_TOKEN_VERSION] + $payload, $flags);
    if ($json === false) {
        media_fail(500, 'sign_failed', 'Não foi possível assinar a resposta.');
    }
    $body = media_b64url_encode($json);
    return $body . '.' . media_hmac($purpose, $body);
}

/**
 * Payload do token se a assinatura confere e ele não expirou; senão encerra com 401.
 *
 * @return array
 */
function media_require_token($purpose, $token)
{
    $parts = is_string($token) ? explode('.', $token) : [];
    if (count($parts) !== 2 || !media_equals(media_hmac($purpose, $parts[0]), $parts[1])) {
        media_fail(401, 'invalid_token', 'Autorização inválida.');
    }
    $json = media_b64url_decode($parts[0]);
    $payload = $json === null ? null : json_decode($json, true);
    if (!is_array($payload) || media_get($payload, 'v') !== MEDIA_TOKEN_VERSION) {
        media_fail(401, 'invalid_token', 'Autorização inválida.');
    }
    $expires = media_get($payload, 'exp');
    if (!is_int($expires) || $expires < time()) {
        media_fail(401, 'expired_token', 'A autorização expirou. Tente de novo.');
    }
    return $payload;
}

/**
 * Extensão do caminho, se ele segue o padrão e a extensão é aceita; senão null.
 *
 * @return string|null
 */
function media_key_extension($key)
{
    if (!is_string($key) || !preg_match(MEDIA_KEY_PATTERN, $key, $match)) {
        return null;
    }
    $extensions = media_extensions();
    return isset($extensions[$match[1]]) ? $match[1] : null;
}

/**
 * Confere pela assinatura do arquivo os formatos de imagem que o libmagic do
 * PHP 5 não conhece: lá, WebP e AVIF saem como application/octet-stream.
 */
function media_sniff_image($path, $extension)
{
    $handle = @fopen($path, 'rb');
    if ($handle === false) {
        return false;
    }
    $head = (string) fread($handle, 32);
    fclose($handle);

    if ($extension === 'webp') {
        // RIFF <tamanho> WEBP
        return substr($head, 0, 4) === 'RIFF' && substr($head, 8, 4) === 'WEBP';
    }
    if ($extension === 'avif') {
        // Caixa ftyp do ISO-BMFF com a marca avif (imagem) ou avis (sequência).
        if (substr($head, 4, 4) !== 'ftyp') {
            return false;
        }
        $brands = str_split(substr($head, 8), 4);
        return in_array('avif', $brands, true) || in_array('avis', $brands, true);
    }
    return false;
}

/** @return string */
function media_path($key)
{
    return __DIR__ . '/uploads/' . $key;
}

/** CORS para o navegador do Workboard (origens em config.php) e resposta ao preflight. */
function media_cors()
{
    $origin = media_get($_SERVER, 'HTTP_ORIGIN', '');
    $allowed = media_get(media_config(), 'allowed_origins', []);
    if ($origin !== '' && is_array($allowed) && in_array($origin, $allowed, true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Access-Control-Allow-Methods: POST, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type');
        header('Access-Control-Max-Age: 600');
    }
    header('Vary: Origin');
    if (media_get($_SERVER, 'REQUEST_METHOD', '') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}
