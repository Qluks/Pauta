import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: "injectManifest", // service worker próprio (sw/sw.ts), necessário para as notificações
      srcDir: "sw",
      filename: "sw.ts",
      registerType: "autoUpdate",
      injectManifest: { globPatterns: ["**/*.{js,css,html,svg,png}"] },
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Pauta",
        short_name: "Pauta",
        description: "Tarefas e notas pessoais",
        lang: "pt-BR",
        start_url: "/",
        scope: "/",
        display: "standalone",
        share_target: {
          action: "/?share=1",
          method: "GET",
          params: { title: "title", text: "text", url: "url" },
        },
        background_color: "#eaf0f6",
        theme_color: "#16213a",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
});
