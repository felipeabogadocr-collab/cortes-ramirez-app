import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.jsx";
import "./index.css";

const LLAVE_RECARGA_CHUNK = "nomos-recarga-por-chunk";

// Sin esto, el "autoUpdate" del plugin PWA no hacía nada por sí solo: el
// service worker nuevo se instalaba en segundo plano (y sí quedaba
// "activo" para próximas pestañas), pero la pestaña YA abierta seguía
// corriendo el código viejo en memoria — nada la obligaba a recargar, así
// que alguien con Nomos abierto de antes podía quedarse horas viendo la
// versión vieja (y el sello de "Actualizado ..." abajo del todo) aunque ya
// hubiera una nueva en el servidor, sin más aviso que ese sello.
//
// - registration.update() revisa si hay una versión nueva: al cargar, cada
//   hora, y también cada vez que se vuelve a esta pestaña (por si alguien
//   la dejó abierta en segundo plano y el despliegue pasó mientras tanto —
//   así no toca esperarse hasta una hora completa para que se entere).
// - "controllerchange" es el aviso de que el service worker nuevo YA tomó
//   control de esta pestaña (autoUpdate lo activa solo, sin preguntar) —
//   ahí es el momento exacto de recargar, una sola vez (mismo candado de
//   sessionStorage que usa el aviso de "vite:preloadError" más abajo, para
//   no recargar dos veces por el mismo despliegue).
registerSW({
  immediate: true,
  onRegisteredSW(swUrl, registration) {
    if (!registration) return;
    const revisar = () => registration.update();
    setInterval(revisar, 60 * 60 * 1000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") revisar();
    });
  },
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (sessionStorage.getItem(LLAVE_RECARGA_CHUNK)) return;
    sessionStorage.setItem(LLAVE_RECARGA_CHUNK, "1");
    window.location.reload();
  });
}

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
