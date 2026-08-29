import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // Sello con la hora exacta de este build — se muestra chiquito en la app
  // para poder comprobar, sin adivinar, si el navegador ya está sirviendo
  // la versión nueva o todavía tiene una vieja guardada en caché.
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: false, // ya servimos public/manifest.webmanifest directamente
      includeAssets: ["favicon-32.png", "apple-touch-icon.png", "icon-192.png", "icon-512.png"],
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
});
