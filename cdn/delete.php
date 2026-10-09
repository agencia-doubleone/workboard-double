<?php
// Apaga um arquivo de uploads/. Chamado só pelo servidor do Workboard
// (POST token=...), nunca pelo navegador: por isso não responde a CORS.
// Idempotente: apagar algo que não existe devolve ok com deleted=false.

require __DIR__ . '/lib.php';

if (media_get($_SERVER, 'REQUEST_METHOD', '') !== 'POST') {
    media_fail(405, 'method_not_allowed', 'Use POST.');
}

$payload = media_require_token('delete', media_get($_POST, 'token'));
$key = media_get($payload, 'key');
if (media_key_extension($key) === null) {
    media_fail(400, 'invalid_key', 'Caminho de arquivo inválido.');
}

$target = media_path($key);
$deleted = false;
if (is_file($target)) {
    if (!unlink($target)) {
        media_fail(500, 'delete_failed', 'Não foi possível apagar o arquivo.');
    }
    $deleted = true;
}

media_json(200, ['ok' => true, 'deleted' => $deleted]);
