// Verifica o CDN de ponta a ponta (npm run cdn:check): envia imagens de
// 1 pixel (PNG e WebP) com um token assinado, confere o recibo, as proteções e apaga.
// Não usa o banco nem o navegador; só MEDIA_CDN_URL e MEDIA_SIGNING_SECRET.

import { env } from "@/env";
import { buildMediaKey } from "@/server/media/keys";
import { signMediaToken, verifyMediaToken } from "@/server/media/token";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);
// WebP é o formato da foto de perfil (src/lib/avatar-image.ts).
const WEBP = Buffer.from("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==", "base64");

type Sample = { name: string; type: string };
const PNG_SAMPLE: Sample = { name: "cdn-check.png", type: "image/png" };
const WEBP_SAMPLE: Sample = { name: "cdn-check.webp", type: "image/webp" };

let failures = 0;

function check(ok: boolean, label: string, detail?: unknown) {
  console.log(`${ok ? "✔" : "✖"} ${label}`);
  if (!ok) {
    failures++;
    if (detail !== undefined) console.log(`    ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  }
}

const seconds = () => Math.floor(Date.now() / 1000);

async function readJson(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { status: response.status, body: text.slice(0, 300) };
  }
}

async function main() {
  if (!env.MEDIA_CDN_URL || !env.MEDIA_SIGNING_SECRET) {
    throw new Error("Defina MEDIA_CDN_URL e MEDIA_SIGNING_SECRET no .env.local.");
  }
  const base = env.MEDIA_CDN_URL;
  const secret = env.MEDIA_SIGNING_SECRET;
  const origin = new URL(env.BETTER_AUTH_URL).origin;
  console.log(`CDN: ${base}\nOrigem do app: ${origin}\n`);

  const upload = (token: string | null, bytes: Buffer = PNG, sample = PNG_SAMPLE) => {
    const form = new FormData();
    if (token) form.append("token", token);
    form.append("file", new Blob([new Uint8Array(bytes)], { type: sample.type }), sample.name);
    return fetch(`${base}/upload.php`, { method: "POST", body: form, headers: { Origin: origin } });
  };
  const uploadToken = (key: string, size: number, sample = PNG_SAMPLE) =>
    signMediaToken(
      "upload",
      { key, name: sample.name, size, type: sample.type, uid: "cdn-check", exp: seconds() + 300 },
      secret,
    );
  const remove = (key: string) =>
    fetch(`${base}/delete.php`, {
      method: "POST",
      body: new URLSearchParams({ token: signMediaToken("delete", { key, exp: seconds() + 60 }, secret) }),
    });

  // Proteções do servidor
  const listing = await fetch(`${base}/uploads/`);
  check([403, 404].includes(listing.status), "uploads/ não lista os arquivos", `status ${listing.status}`);

  const config = await fetch(`${base}/config.php`);
  check([403, 404].includes(config.status), "config.php não é acessível pela web", `status ${config.status}`);

  const preflight = await fetch(`${base}/upload.php`, {
    method: "OPTIONS",
    headers: { Origin: origin, "Access-Control-Request-Method": "POST" },
  });
  check(
    preflight.headers.get("access-control-allow-origin") === origin,
    `CORS libera ${origin} (allowed_origins no config.php)`,
    `status ${preflight.status}, allow-origin: ${preflight.headers.get("access-control-allow-origin")}`,
  );

  const noToken = await upload(null);
  check(noToken.status === 401, "upload sem token é recusado", await readJson(noToken));

  // Envio válido
  const key = buildMediaKey({ folder: "geral", fileName: "cdn-check.png", extension: "png" });
  const token = uploadToken(key, PNG.length);
  const stored = await upload(token);
  const storedBody = await readJson(stored);
  check(stored.status === 201 && storedBody.ok === true, "upload.php grava o arquivo", storedBody);

  const receipt =
    typeof storedBody.receipt === "string" ? verifyMediaToken("receipt", storedBody.receipt, secret) : null;
  check(
    receipt?.key === key && receipt?.size === PNG.length && receipt?.uid === "cdn-check",
    "recibo assinado confere com o MEDIA_SIGNING_SECRET",
    receipt ?? "recibo ausente ou com assinatura diferente (secret do config.php igual ao do .env?)",
  );

  const file = await fetch(`${base}/uploads/${key}`);
  check(
    file.status === 200 && (file.headers.get("content-type") ?? "").startsWith("image/png"),
    "arquivo público acessível pela URL",
    `status ${file.status}, content-type: ${file.headers.get("content-type")}`,
  );
  check(
    file.headers.get("x-content-type-options") === "nosniff",
    "uploads/ responde com nosniff e cache (mod_headers ativo)",
    `x-content-type-options: ${file.headers.get("x-content-type-options")}`,
  );

  // O libmagic de PHPs antigos não reconhece WebP: o upload.php confere pela assinatura.
  const webpKey = buildMediaKey({ folder: "geral", fileName: WEBP_SAMPLE.name, extension: "webp" });
  const webpStored = await upload(uploadToken(webpKey, WEBP.length, WEBP_SAMPLE), WEBP, WEBP_SAMPLE);
  check(webpStored.status === 201, "upload.php aceita WebP (formato da foto de perfil)", await readJson(webpStored));
  const webpFile = await fetch(`${base}/uploads/${webpKey}`);
  check(
    webpFile.status === 200 && (webpFile.headers.get("content-type") ?? "").startsWith("image/webp"),
    "WebP servido como image/webp",
    `status ${webpFile.status}, content-type: ${webpFile.headers.get("content-type")}`,
  );
  await remove(webpKey);

  // Tentativas que precisam falhar
  const replay = await upload(token);
  check(replay.status === 409, "o mesmo token não serve para um segundo envio", await readJson(replay));

  const at = token.length - 10; // dentro da assinatura
  const tampered = `${token.slice(0, at)}${token[at] === "A" ? "B" : "A"}${token.slice(at + 1)}`;
  const forged = await upload(tampered);
  check(forged.status === 401, "token adulterado é recusado", await readJson(forged));

  const otherKey = buildMediaKey({ folder: "geral", fileName: "cdn-check.png", extension: "png" });
  const wrongSize = await upload(uploadToken(otherKey, PNG.length + 1));
  check(wrongSize.status === 400, "arquivo de tamanho diferente do autorizado é recusado", await readJson(wrongSize));

  // Exclusão (servidor para servidor)
  const removal = await remove(key);
  const removalBody = await readJson(removal);
  check(removal.status === 200 && removalBody.deleted === true, "delete.php apaga o arquivo", removalBody);

  const gone = await fetch(`${base}/uploads/${key}`);
  check(gone.status === 404, "arquivo apagado some da URL pública", `status ${gone.status}`);

  if (failures > 0) {
    console.log(`\n✖ ${failures} verificação(ões) falharam. Arquivo de teste: uploads/${key}`);
    process.exit(1);
  }
  console.log("\n✔ CDN pronto para uso.");
}

main().catch((error: unknown) => {
  console.error("✖ Falha na verificação:", error instanceof Error ? error.message : error);
  process.exit(1);
});
