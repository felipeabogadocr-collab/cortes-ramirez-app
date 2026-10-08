import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.jsx";
import "./index.css";

const LLAVE_RECARGA_CHUNK = "nomos-recarga-por-chunk";

// Red de seguridad para el enlace corto del portal (/p/CODIGO): si por
// alguna razón llega a la app en vez de al servidor, igual abre el portal.
const enlaceCorto = window.location.pathname.match(/^\/p\/([^/]+)\/?$/);
if (enlaceCorto) window.history.replaceState(null, "", `/?codigo=${enlaceCorto[1]}#portal`);

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

// Recargar de golpe al volver a la pestaña hacía perder lo que el usuario
// tenía a medias (un recibo cargando, un documento, un formulario). Ahora
// solo se recarga sola si lleva más de 10 minutos sin tocar nada; si está
// trabajando, aparece un aviso discreto con el botón "Actualizar" y la
// recarga queda para cuando él quiera (o para la próxima pausa larga).
const MINUTOS_SIN_ACTIVIDAD_PARA_RECARGAR = 10;
let ultimaActividad = Date.now();
["pointerdown", "keydown", "touchstart", "input"].forEach((ev) => window.addEventListener(ev, () => (ultimaActividad = Date.now()), { passive: true }));
const inactivoHaceRato = () => Date.now() - ultimaActividad > MINUTOS_SIN_ACTIVIDAD_PARA_RECARGAR * 60 * 1000;

function recargarPorVersionNueva() {
  if (sessionStorage.getItem(LLAVE_RECARGA_CHUNK)) return;
  sessionStorage.setItem(LLAVE_RECARGA_CHUNK, "1");
  window.location.reload();
}

function avisarVersionNueva() {
  if (document.getElementById("nomos-aviso-version")) return;
  const aviso = document.createElement("div");
  aviso.id = "nomos-aviso-version";
  aviso.setAttribute("role", "status");
  aviso.style.cssText =
    "position:fixed;left:50%;transform:translateX(-50%);bottom:calc(16px + env(safe-area-inset-bottom));z-index:99999;display:flex;align-items:center;gap:12px;background:#13302F;color:#fff;font:600 13.5px Inter,system-ui,sans-serif;padding:10px 12px 10px 16px;border-radius:14px;box-shadow:0 12px 30px rgba(0,0,0,.25);max-width:calc(100vw - 32px)";
  aviso.innerHTML = '<span>Hay una versión nueva de Nomos.</span><button type="button" style="background:#fff;color:#13302F;border:none;border-radius:9px;padding:7px 12px;font:700 13px Inter,system-ui,sans-serif;cursor:pointer">Actualizar</button>';
  aviso.querySelector("button").onclick = () => window.location.reload();
  document.body.appendChild(aviso);
  // Si después se queda quieto más de 10 minutos, se actualiza solo.
  const revisar = setInterval(() => {
    if (inactivoHaceRato()) {
      clearInterval(revisar);
      recargarPorVersionNueva();
    }
  }, 60 * 1000);
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (inactivoHaceRato()) recargarPorVersionNueva();
    else avisarVersionNueva();
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
