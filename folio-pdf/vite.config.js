import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // "autoUpdate" activa la versión nueva sola en segundo plano en la
      // siguiente visita, para que nadie se quede pegado viendo una versión
      // vieja de Folio después de que publiquemos un cambio.
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Folio · Herramientas PDF gratis",
        short_name: "Folio",
        lang: "es",
        description: "Unir, organizar, dividir, firmar y comprimir PDF — 100% en tu navegador, sin registros ni costo. Gratis para todos.",
        theme_color: "#0a2342",
        background_color: "#f5f6f8",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // No cachear las respuestas del panel de administración ni de sus
        // funciones — deben verse siempre en vivo, nunca desde la caché.
        navigateFallbackDenylist: [/^\/panel/, /^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^\/api\//,
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ],
});
