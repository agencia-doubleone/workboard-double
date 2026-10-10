<?php
// Lista os arquivos de uploads/ para a tela de Arquivos do Workboard comparar
// com o que está registrado no banco (arquivos sem registro e registros sem
// arquivo). Chamado só pelo servidor do Workboard (POST token=..., finalidade
// "list"), nunca pelo navegador: por isso não responde a CORS.
//
// Só entram os caminhos no formato que o Workboard cria
// (pasta/ano/mês/aleatório-nome.ext); qualquer outra coisa (arquivos ocultos,
// coisas postas à mão fora do padrão) só é contada em "ignored".

require __DIR__ . '/lib.php';

// Teto da resposta: acima disso a lista vem cortada (truncated = true).
const MEDIA_LIST_LIMIT = 50000;

if (media_get($_SERVER, 'REQUEST_METHOD', '') !== 'POST') {
    media_fail(405, 'method_not_allowed', 'Use POST.');
}

media_require_token('list', media_get($_POST, 'token'));

$root = __DIR__ . '/uploads';
$files = [];
$ignored = 0;
$truncated = false;

/**
 * Entradas visíveis de uma pasta (sem ".", ".." e ocultos como o .htaccess).
 *
 * @return array
 */
function media_list_dir($path)
{
    $entries = @scandir($path);
    if ($entries === false) {
        return [];
    }
    $visible = [];
    foreach ($entries as $entry) {
        if ($entry !== '' && $entry[0] !== '.') {
            $visible[] = $entry;
        }
    }
    return $visible;
}

// uploads/<pasta>/<ano>/<mês>/<arquivo>: quatro níveis, sem seguir links simbólicos.
foreach (media_list_dir($root) as $folder) {
    $folderPath = $root . '/' . $folder;
    if (!is_dir($folderPath) || is_link($folderPath)) {
        $ignored++;
        continue;
    }
    foreach (media_list_dir($folderPath) as $year) {
        $yearPath = $folderPath . '/' . $year;
        if (!is_dir($yearPath) || is_link($yearPath)) {
            $ignored++;
            continue;
        }
        foreach (media_list_dir($yearPath) as $month) {
            $monthPath = $yearPath . '/' . $month;
            if (!is_dir($monthPath) || is_link($monthPath)) {
                $ignored++;
                continue;
            }
            foreach (media_list_dir($monthPath) as $name) {
                $path = $monthPath . '/' . $name;
                $key = $folder . '/' . $year . '/' . $month . '/' . $name;
                if (!is_file($path) || is_link($path) || media_key_extension($key) === null) {
                    $ignored++;
                    continue;
                }
                if (count($files) >= MEDIA_LIST_LIMIT) {
                    $truncated = true;
                    break 4;
                }
                $files[] = ['key' => $key, 'size' => filesize($path), 'mtime' => filemtime($path)];
            }
        }
    }
}

media_json(200, ['ok' => true, 'files' => $files, 'ignored' => $ignored, 'truncated' => $truncated]);
