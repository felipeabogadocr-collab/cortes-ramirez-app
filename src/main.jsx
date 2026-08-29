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

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
