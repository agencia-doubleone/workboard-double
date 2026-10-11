import { readdirSync } from "node:fs";
import { join } from "node:path";

import type { NextConfig } from "next";

/**
 * Imagens das conquistas que existem em public/conquistas (lidas no build e ao
 * subir o dev). Sem a imagem, a conquista mostra o emoji (src/lib/achievements.ts).
 */
function listAchievementImages() {
  try {
    return readdirSync(join(process.cwd(), "public", "conquistas"))
      .filter((file) => /\.(png|webp|svg)$/i.test(file))
      .join(",");
  } catch {
    return "";
  }
}

const nextConfig: NextConfig = {
  cacheComponents: true,
  env: { ACHIEVEMENT_IMAGES: listAchievementImages() },
  // O canto inferior esquerdo é ocupado pelo menu do usuário na sidebar.
  devIndicators: { position: "bottom-right" },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
