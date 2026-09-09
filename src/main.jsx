import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.jsx";
import "./index.css";

// Sin esto, el "autoUpdate" del plugin PWA no hacía nada por sí solo: el
// service worker nuevo se instalaba en segundo plano pero la pestaña ya
// abierta se quedaba corriendo el código viejo indefinidamente hasta que el
// usuario cerrara TODAS las pestañas — en la práctica, nunca. registerSW()
// revisa si hay una versión nueva al cargar y cada hora mientras la pestaña
// sigue abierta, y en cuanto la encuentra recarga la página sola.
registerSW({
  immediate: true,
  onRegisteredSW(swUrl, registration) {
    if (!registration) return;
    setInterval(() => registration.update(), 60 * 60 * 1000);
  },
});

// Lo de arriba cubre "hay versión nueva disponible" — esto cubre el caso
// más molesto en la práctica: alguien ya tenía Nomos abierto ANTES de un
// despliegue, y en algún momento (sin recargar) hace clic en una pestaña
// que todavía no había visitado en esta sesión (Vigilancia, Contabilidad,
// etc.). Esa pestaña se carga con "import() dinámico" pidiendo un archivo
// con el nombre de ESTA versión — pero el servidor ya solo tiene los
// archivos de la versión nueva, así que la descarga falla. Vite dispara el
// evento "vite:preloadError" exactamente en ese caso; antes nada lo
// escuchaba y el usuario se quedaba viendo "Algo salió mal" sin saber que
// bastaba con recargar. Ahora se recarga sola, una sola vez (el
// sessionStorage evita un bucle infinito si el problema fuera otro y
// persistiera después de recargar).
const LLAVE_RECARGA_CHUNK = "nomos-recarga-por-chunk";
window.addEventListener("vite:preloadError", () => {
  if (sessionStorage.getItem(LLAVE_RECARGA_CHUNK)) return;
  sessionStorage.setItem(LLAVE_RECARGA_CHUNK, "1");
  window.location.reload();
});
// Si la app carga bien y sigue corriendo sin problema, se limpia el
// candado para que un despliegue futuro también pueda recargarse solo.
setTimeout(() => sessionStorage.removeItem(LLAVE_RECARGA_CHUNK), 10000);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
