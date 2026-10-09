<?php
// Copie para config.php (na mesma pasta do upload.php) e preencha.
// O config.php fica só no servidor: não versione.

return [
    // O mesmo valor de MEDIA_SIGNING_SECRET no .env do Workboard (mínimo 32 caracteres).
    'secret' => '',

    // Origens do Workboard que podem enviar arquivos direto do navegador.
    'allowed_origins' => [
        'https://workboard.doubleone.com.br',
        'http://localhost:3000',
    ],

    // Teto por arquivo, em bytes. O limite por tipo é decidido no Workboard
    // (src/lib/media.ts); este é só a trava final do servidor.
    'max_size' => 512 * 1024 * 1024,
];
