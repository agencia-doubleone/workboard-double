<?php
// Recebe um arquivo do navegador (POST multipart: token + file), autorizado
// por um token de /api/media/sign do Workboard, e grava em uploads/{key}.
// Responde com um recibo assinado que o Workboard confere antes de registrar.

declare(strict_types=1);

require __DIR__ . '/lib.php';

media_cors();

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    media_fail(405, 'method_not_allowed', 'Use POST.');
}

// Corpo acima do post_max_size: o PHP descarta tudo e $_POST/$_FILES chegam vazios.
if (empty($_POST) && empty($_FILES) && (int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
    media_fail(413, 'too_large', 'Arquivo maior que o limite do servidor de arquivos.');
}

$ticket = media_require_token('upload', $_POST['token'] ?? null);
$key = $ticket['key'] ?? null;
$extension = media_key_extension($key);
if ($extension === null) {
    media_fail(400, 'invalid_key', 'Caminho de arquivo inválido.');
}

$file = $_FILES['file'] ?? null;
if (!is_array($file) || !is_int($file['error'] ?? null)) {
    media_fail(400, 'missing_file', 'Nenhum arquivo recebido.');
}
switch ($file['error']) {
    case UPLOAD_ERR_OK:
        break;
    case UPLOAD_ERR_INI_SIZE:
    case UPLOAD_ERR_FORM_SIZE:
        media_fail(413, 'too_large', 'Arquivo maior que o limite do servidor de arquivos.');
        break;
    case UPLOAD_ERR_PARTIAL:
        media_fail(400, 'partial', 'O envio foi interrompido. Tente de novo.');
        break;
    default:
        // Sem pasta temporária, sem permissão de escrita, extensão do PHP bloqueando...
        media_fail(500, 'upload_error', 'O servidor de arquivos não conseguiu receber o envio (código ' . $file['error'] . ').');
}
if (!is_uploaded_file($file['tmp_name'])) {
    media_fail(400, 'missing_file', 'Nenhum arquivo recebido.');
}

// O token fixa o tamanho exato: não dá para autorizar um arquivo e mandar outro.
$size = (int) $file['size'];
if ($size !== ($ticket['size'] ?? null)) {
    media_fail(400, 'size_mismatch', 'O arquivo recebido não corresponde ao que foi autorizado.');
}
$maxSize = (int) (media_config()['max_size'] ?? 0);
if ($maxSize > 0 && $size > $maxSize) {
    media_fail(413, 'too_large', 'Arquivo maior que o limite do servidor de arquivos.');
}

// Confere o conteúdo, não só a extensão.
if (!class_exists('finfo')) {
    media_fail(500, 'fileinfo_missing', 'Ative a extensão fileinfo do PHP no servidor de arquivos.');
}
$detected = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']) ?: 'application/octet-stream';
if (in_array($detected, MEDIA_BLOCKED_TYPES, true)) {
    media_fail(415, 'blocked_type', 'O conteúdo deste arquivo não é permitido.');
}
if (MEDIA_EXTENSIONS[$extension] === 'image' && strpos($detected, 'image/') !== 0) {
    media_fail(415, 'not_an_image', 'O arquivo não é uma imagem válida.');
}

// Nunca sobrescreve: um token só vale para um envio.
$target = media_path($key);
if (file_exists($target)) {
    media_fail(409, 'already_exists', 'Este envio já foi concluído.');
}
$directory = dirname($target);
if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) {
    media_fail(500, 'write_failed', 'Não foi possível criar a pasta de destino.');
}
if (!move_uploaded_file($file['tmp_name'], $target)) {
    media_fail(500, 'write_failed', 'Não foi possível gravar o arquivo.');
}
@chmod($target, 0644);

media_json(201, [
    'ok' => true,
    'key' => $key,
    'size' => $size,
    'receipt' => media_sign('receipt', [
        'key' => $key,
        'name' => $ticket['name'] ?? '',
        'size' => $size,
        'type' => $ticket['type'] ?? '',
        'uid' => $ticket['uid'] ?? '',
        'iat' => time(),
    ]),
]);
