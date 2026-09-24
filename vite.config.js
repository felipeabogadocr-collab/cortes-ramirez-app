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
  build: {
    rollupOptions: {
      output: {
        // Sin esto, TODO el código (el de React/Supabase, que casi nunca
        // cambia, junto con el de App.jsx, que cambia en casi cada
        // despliegue) vivía en un solo archivo — así que cada actualización
        // de Nomos obligaba a volver a descargar ese archivo entero de
        // nuevo, aunque el 60% de su contenido (las librerías) fuera
        // idéntico al despliegue anterior. Separarlas en su propio archivo
        // deja que el navegador las guarde en caché de verdad: después de
        // este cambio, actualizar Nomos solo baja lo que de verdad cambió.
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("@supabase")) return "vendor-supabase";
            if (id.includes("react-dom") || id.includes("/react/") || id.includes("/scheduler/")) return "vendor-react";
          }
        },
      },
    },
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
