import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
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
