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
            // Nombre propio para la librería de Word: así el service worker
            // puede dejarla fuera del precache (ver globIgnores abajo).
            if (id.includes("/docx/")) return "vendor-docx";
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
        // "webp" se agregó junto con el logo liviano del recibo — sin esto,
        // ese archivo no quedaba precacheado como el PNG que reemplazó, y
        // generar un recibo por primera vez estando sin conexión habría
        // fallado (la promesa de "funciona sin internet" ya no se cumplía
        // para ese caso puntual).
        globPatterns: ["**/*.{js,css,html,png,webp,svg,woff2}"],
        // Fuera del precache lo que casi nunca se usa y pesa mucho: Excel,
        // Word, los extras de jsPDF que los recibos no usan (HTML/SVG) y las
        // imágenes de vista previa para WhatsApp/redes. Se guardan en caché
        // la primera vez que se usan (runtimeCaching), así que siguen
        // funcionando sin internet después — pero ya no se bajan ~600 KB
        // en segundo plano en la primera visita. jsPDF y el logo PNG se
        // quedan: generar un recibo sin conexión debe seguir funcionando.
        globIgnores: ["**/og-*", "**/xlsx-*.js", "**/vendor-docx-*.js", "**/html2canvas*.js", "**/purify*.js", "**/index.es-*.js", "**/*-latin-ext-*.woff2"],
        navigateFallbackDenylist: [/^\/api\//, /^\/p\//],
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/assets/"),
            handler: "CacheFirst",
            options: { cacheName: "nomos-bajo-demanda", expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 60 } },
          },
        ],
      },
    }),
  ],
});
