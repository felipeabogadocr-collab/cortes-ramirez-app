// Piezas de interfaz compartidas entre el panel del despacho y las páginas
// públicas (portal del cliente, firma, landing, legales). Viven aparte de
// App.jsx para que esas páginas no tengan que descargar el panel completo.

import { useEffect, useRef, useState } from "react";

export const COLORS = {
  bg: "var(--drx-bg)",
  panel: "var(--drx-panel)",
  // Antes era un verde bosque muy oscuro (#0B3D2E) — a pedido de Felipe se
  // probó primero un verde salvia (#4A7C6D) que no convenció, y se quedó
  // en este teal suave: más tranquilo y menos pesado visualmente que el
  // original, sin el aire "lavado" que tenía el verde salvia.
  navy: "#3E7C7C",
  navyDeep: "#2C5858",
  ink: "var(--drx-ink)",
  inkSoft: "var(--drx-ink-soft)",
  muted: "var(--drx-muted)",
  border: "var(--drx-border)",
  headingText: "var(--drx-heading)",
  surfaceSoft: "var(--drx-surface-soft)",
  accent: "#3E7C7C",
  accentBright: "#16A34A",
  accentSoft: "#E3F5EA",
  black: "#0B0B0C",
};

export const TIPOS_ID = ["Cédula de ciudadanía", "Cédula de extranjería", "Pasaporte", "Tarjeta de identidad", "NIT"];

// Número de WhatsApp del despacho (con indicativo, sin espacios ni +), usado en el botón "¿Tienes dudas?"
export const NUMERO_WHATSAPP_DESPACHO = "573192875428";

export const COLOR_AREA_PROCESO = {
  Civil: "#2F80ED",
  Penal: "#DC2626",
  Laboral: "#F5A524",
  Familia: "#8B5CF6",
  Comercial: "#10B981",
  Administrativo: "#0EA5E9",
  Constitucional: "#6B7480",
  Concursal: "#78350F",
  Otro: "#14B8A6",
};

// SHA-256 en hexadecimal, usado como hash de integridad de documentos: al
// firmar, se guarda el hash del contenido en ese momento; al ver el
// documento después, se recalcula y se compara — si no coincide, alguien lo
// modificó después de firmado (Ley 527 de 1999, art. 7).
export async function sha256Hex(texto) {
  try {
    const bytes = new TextEncoder().encode(texto || "");
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch (e) {
    // Navegador sin Web Crypto (muy raro): sin hash, no rompe el flujo.
    return null;
  }
}

export const FONT_IMPORT_ID = "despacho-fonts";

export function ensureFonts() {
  if (document.getElementById(FONT_IMPORT_ID)) return;
  const link = document.createElement("link");
  link.id = FONT_IMPORT_ID;
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;800&family=Source+Serif+4:wght@400;500;600;700&family=Inter:wght@400;500;600;700;800;900&family=Dancing+Script:wght@600;700&display=swap";
  document.head.appendChild(link);
}

export const GlobalStyle = () => (
  <style>{`
    /* --- Bordes seguros del celular (iPhone con isla/notch, barra de gestos,
       Android con barra de navegación) ---
       La app pide ocupar toda la pantalla (viewport-fit=cover + barra de
       estado translúcida en iPhone instalado), así que el sistema dibuja la
       hora y la batería ENCIMA del contenido. Estas variables son el alto
       de cada borde (0 en computador o donde no aplica) y el body se corre
       hacia adentro esa misma medida; la franja de arriba se pinta del verde
       de la marca para que la hora (blanca) siempre se lea. */
    :root {
      --sat: env(safe-area-inset-top, 0px);
      --sab: env(safe-area-inset-bottom, 0px);
      --sal: env(safe-area-inset-left, 0px);
      --sar: env(safe-area-inset-right, 0px);
    }
    html { background: #F4F6F9; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
    /* El body se corre hacia adentro el alto de cada borde. Las barras
       "sticky" (encabezados) usan top: 0: el navegador ya las pega debajo de
       este relleno, porque el body es el que hace scroll. Las "fixed" van
       contra la pantalla completa y por eso suman var(--sat)/var(--sab). */
    body {
      padding: var(--sat) var(--sar) var(--sab) var(--sal) !important;
      -webkit-tap-highlight-color: transparent;
      overscroll-behavior-y: none;
    }
    body::before {
      content: "";
      position: fixed;
      top: 0; left: 0; right: 0;
      height: var(--sat);
      background: #3E7C7C;
      z-index: 100000;
      pointer-events: none;
    }
    /* iPhone hace zoom solo al tocar un campo con letra de menos de 16px y
       la pantalla queda descuadrada (corrida a un lado) — en celular todos
       los campos usan 16px. */
    @media (max-width: 860px) {
      input:not([type="checkbox"]):not([type="radio"]), select, textarea { font-size: 16px !important; }
    }
    :root, .drx-tema-claro {
      --drx-bg: #F4F6F9;
      --drx-panel: #FFFFFF;
      --drx-ink: #0B1220;
      --drx-ink-soft: #3B4657;
      --drx-muted: #6B7480;
      --drx-border: #DFE3EA;
      --drx-heading: #3E7C7C;
      --drx-surface-soft: #FAFAF8;
    }
    .drx-tema-oscuro {
      --drx-bg: #10151D;
      --drx-panel: #1A212C;
      --drx-ink: #EDEFF3;
      --drx-ink-soft: #C7CDD6;
      --drx-muted: #8B95A3;
      --drx-border: #2B3542;
      --drx-heading: #7FCBA4;
      --drx-surface-soft: #232C39;
    }
    .drx-tema-claro, .drx-tema-oscuro { transition: background-color .2s ease, color .2s ease, border-color .2s ease; }
    .drx-btn-primary { transition: transform .15s ease, filter .15s ease, box-shadow .15s ease; }
    .drx-btn-primary:hover { filter: brightness(1.15); transform: translateY(-1px); }
    .drx-btn-primary:active { transform: scale(0.97) translateY(0); filter: brightness(0.95); }
    .drx-btn-ghost { transition: background .15s ease, border-color .15s ease, transform .15s ease, box-shadow .15s ease; }
    .drx-btn-ghost:hover { transform: translateY(-1px); box-shadow: 0 4px 10px rgba(16,24,40,0.08); }
    .drx-btn-ghost:active { transform: scale(0.97); box-shadow: none; }
    .drx-tema-claro .drx-btn-ghost:hover { background: #EEF2F7; border-color: #B9C2CF; }
    .drx-tema-oscuro .drx-btn-ghost:hover { background: #232C39; border-color: #3A4657; }
    .drx-card { transition: box-shadow .18s ease, border-color .18s ease, transform .18s ease; box-shadow: 0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.05); }
    .drx-tema-oscuro .drx-card { box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
    .drx-tema-claro .drx-card:hover { box-shadow: 0 10px 26px rgba(11,61,46,0.1); border-color: #C7D6EA; }
    .drx-tema-oscuro .drx-card:hover { box-shadow: 0 10px 30px rgba(0,0,0,0.5); border-color: #3A4A63; }
    .drx-tab { transition: background .15s ease, color .15s ease, filter .15s ease, transform .15s ease; }
    .drx-tab:hover { filter: brightness(1.45); transform: translateX(2px); }
    .drx-tab:active { transform: translateX(2px) scale(0.98); }
    .drx-input { transition: border-color .15s ease, box-shadow .15s ease; }
    .drx-input:focus { border-color: ${COLORS.accentBright} !important; box-shadow: 0 0 0 3px ${COLORS.accentSoft}; }
    .drx-fila-funcion p:first-child { transition: color .2s ease; }
    .drx-fila-funcion:hover p:first-child { color: ${COLORS.accentBright} !important; }
    .drx-chip-vigilancia { transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease; }
    .drx-chip-vigilancia:hover { transform: translateY(-1px); border-color: ${COLORS.accentBright} !important; }
    .drx-senal-clicable:hover { background: ${COLORS.surfaceSoft} !important; }
    .drx-dia-mes { transition: background .12s ease; }
    .drx-dia-mes:hover { background: #F6F3FD !important; }
    .drx-chip-vigilancia:active { transform: translateY(0) scale(0.97); }
    /* El calendario que se despliega al hacer clic es del navegador — eso no
       se puede re-diseñar (por seguridad, ningún navegador deja tocar ese
       popup con CSS). Lo que sí se puede vestir es el campo cerrado: el
       ícono de calendario se recolorea al verde de marca, y al pasar el
       mouse o enfocarlo se resalta como el resto de los campos "premium". */
    input[type="date"].drx-input, input[type="date"] { color-scheme: light; }
    .drx-tema-oscuro input[type="date"] { color-scheme: dark; }
    input[type="date"]::-webkit-calendar-picker-indicator {
      cursor: pointer;
      border-radius: 6px;
      padding: 3px;
      filter: invert(38%) sepia(90%) saturate(400%) hue-rotate(100deg) brightness(95%);
      transition: background .15s ease, filter .15s ease;
    }
    input[type="date"]::-webkit-calendar-picker-indicator:hover {
      background: ${COLORS.accentSoft};
    }
    .drx-tema-oscuro input[type="date"]::-webkit-calendar-picker-indicator {
      filter: invert(70%) sepia(60%) saturate(400%) hue-rotate(70deg) brightness(1.1);
    }
    .drx-btn-primary:hover { box-shadow: 0 6px 20px rgba(22,163,74,0.35); }
    .drx-glow { position: relative; }
    .drx-glow > * { position: relative; z-index: 1; }
    .drx-tema-oscuro .drx-glow::before {
      content: "";
      position: absolute;
      top: -140px;
      left: 50%;
      transform: translateX(-50%);
      width: 640px;
      height: 320px;
      background: radial-gradient(circle, rgba(22,163,74,0.28), transparent 70%);
      filter: blur(50px);
      pointer-events: none;
      z-index: 0;
    }
    @keyframes drx-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(22,163,74,0.35); } 50% { box-shadow: 0 0 0 6px rgba(22,163,74,0); } }
    @keyframes drx-pulse-lex { 0%, 100% { box-shadow: 0 4px 14px rgba(11,61,46,0.4), 0 0 0 0 rgba(22,163,74,0.35); } 50% { box-shadow: 0 4px 14px rgba(11,61,46,0.4), 0 0 0 8px rgba(22,163,74,0); } }
    @keyframes drx-flotar { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
    @keyframes drx-fade-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    .drx-fade-in { animation: drx-fade-in 0.22s ease; }
    @keyframes drx-tab-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    .drx-tab-transition { animation: drx-tab-in 0.32s cubic-bezier(0.16, 1, 0.3, 1); }
    @keyframes drx-barra-progreso { 0% { width: 0%; opacity: 1; } 70% { width: 85%; opacity: 1; } 100% { width: 100%; opacity: 0; } }
    .drx-barra-progreso { animation: drx-barra-progreso 0.5s ease-out forwards; }
    @keyframes drx-campana { 0%, 100% { transform: rotate(0deg); } 20% { transform: rotate(-14deg); } 40% { transform: rotate(11deg); } 60% { transform: rotate(-7deg); } 80% { transform: rotate(4deg); } }
    .drx-campana-sonando svg { animation: drx-campana 0.6s ease-in-out; transform-origin: top center; }
    @keyframes drx-spin { to { transform: rotate(360deg); } }
    .drx-card:hover { transform: translateY(-2px); }
    @keyframes drx-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
    @keyframes drx-mesh { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(3%, -4%) scale(1.08); } }
    .drx-cta-shine { position: relative; overflow: hidden; }
    .drx-cta-shine::after {
      content: ""; position: absolute; top: 0; left: -60%; width: 40%; height: 100%;
      background: linear-gradient(115deg, transparent, rgba(255,255,255,0.45), transparent);
      transform: skewX(-20deg); transition: left 0.55s ease;
    }
    .drx-cta-shine:hover::after { left: 130%; }

    @keyframes drx-dropdown-in { from { opacity: 0; transform: translateY(-6px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
    .drx-dropdown-in { animation: drx-dropdown-in 0.18s cubic-bezier(0.16, 1, 0.3, 1); transform-origin: top right; }

    /* Selección de texto y checkboxes/radios en el color de marca en vez del
       azul por defecto del navegador — un detalle chico que se nota en toda
       la app porque aparece en cualquier formulario. */
    ::selection { background: ${COLORS.accentBright}; color: #FFFFFF; }
    input[type="checkbox"], input[type="radio"] { accent-color: ${COLORS.accentBright}; }

    /* Anillo de foco consistente por teclado (accesibilidad + terminado) en
       vez del contorno azul por defecto, distinto en cada navegador. */
    button:focus-visible, a:focus-visible, input[type="checkbox"]:focus-visible, input[type="radio"]:focus-visible {
      outline: 2px solid ${COLORS.accentBright};
      outline-offset: 2px;
    }

    button:disabled { opacity: 0.55; cursor: not-allowed; filter: none !important; transform: none !important; box-shadow: none !important; }

    /* Scrollbar delgado en el color de marca — el de sistema por defecto es
       lo primero que rompe la sensación de "app terminada" en pantallas con
       mucho contenido (Contabilidad, Auditoría, el chat del asistente). */
    ::-webkit-scrollbar { width: 10px; height: 10px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: ${COLORS.border}; border-radius: 20px; border: 2px solid transparent; background-clip: padding-box; }
    ::-webkit-scrollbar-thumb:hover { background: ${COLORS.accentBright}; background-clip: padding-box; }
    * { scrollbar-width: thin; scrollbar-color: ${COLORS.border} transparent; }

    .drx-boton-tema { transition: background .15s ease, border-color .15s ease, transform .15s ease; }
    .drx-boton-tema:hover { transform: rotate(-12deg); }
    .drx-boton-tema:active { transform: scale(0.9); }
    .drx-tema-claro .drx-boton-tema:hover { background: #EEF2F7; border-color: #B9C2CF; }
    .drx-tema-oscuro .drx-boton-tema:hover { background: #232C39; border-color: #3A4657; }
    @keyframes drx-icono-tema-in { from { opacity: 0; transform: rotate(-90deg) scale(0.5); } to { opacity: 1; transform: rotate(0) scale(1); } }
    .drx-boton-tema-icono { display: flex; animation: drx-icono-tema-in 0.35s cubic-bezier(0.16, 1, 0.3, 1); }
    /* Quien activó "reducir movimiento" en su celular o computador (por
       mareo, migraña o simple preferencia) ve la app sin deslizamientos ni
       flotaciones; los indicadores de carga siguen girando para que se
       note que algo está pasando. */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
      [style*="drx-spin"] { animation-duration: 0.9s !important; animation-iteration-count: infinite !important; }
    }

    .drx-ojo-contrasena { transition: background .15s ease, color .15s ease; }
    .drx-ojo-contrasena:hover { color: ${COLORS.accentBright} !important; background: ${COLORS.accentSoft} !important; }

    .drx-tabla-planes tbody tr { transition: background .12s ease; }
    .drx-tabla-planes tbody tr:hover td { background: ${COLORS.accentSoft} !important; }

    /* --- Móvil: la barra lateral pasa de columna fija a cajón deslizable,
       y varias cuadrículas de formulario de 2-3 columnas se apilan en 1 --- */
    .drx-btn-hamburguesa { display: none; }
    .drx-sidebar-overlay { display: none; }
    @media (max-width: 860px) {
      .drx-app-shell { display: block !important; }
      .drx-sidebar {
        position: fixed !important;
        left: 0;
        top: 0;
        /* 100vh en el navegador móvil mide el viewport MÁS GRANDE posible
           (con la barra de direcciones oculta) — cuando esa barra está
           visible, el 100vh calculado se pasa de la altura real y el cajón
           terminaba recortado/con un salto raro abajo (la parte de "Cambiar
           de usuario / Cerrar sesión" se veía pegada arriba con un hueco en
           blanco debajo). 100dvh sigue el alto real y visible del momento;
           se declara después como mejora progresiva — donde no existe, el
           navegador simplemente se queda con el 100vh de arriba. */
        height: 100vh !important;
        height: 100dvh !important;
        width: 250px !important;
        max-width: 82vw;
        transform: translateX(-105%);
        transition: transform 0.25s ease;
        z-index: 200 !important;
        box-shadow: 10px 0 32px rgba(0,0,0,0.35);
      }
      .drx-sidebar.drx-sidebar-abierta { transform: translateX(0); overscroll-behavior: contain; }
      .drx-sidebar { padding-top: calc(24px + var(--sat)) !important; padding-bottom: calc(24px + var(--sab)) !important; padding-left: calc(16px + var(--sal)) !important; }
      .drx-sidebar-overlay.drx-sidebar-abierta {
        display: block;
        position: fixed;
        inset: 0;
        background: rgba(6,14,28,0.5);
        z-index: 150;
      }
      .drx-btn-hamburguesa {
        display: flex !important;
        align-items: center;
        justify-content: center;
        width: 38px;
        height: 38px;
        flex-shrink: 0;
        background: transparent;
        border: 1px solid var(--drx-border);
        border-radius: 8px;
        cursor: pointer;
        color: var(--drx-heading);
      }
      .drx-topbar { padding: 10px 12px !important; flex-wrap: wrap; row-gap: 8px !important; }
      .drx-topbar > div:not(.drx-topbar-acciones) { order: 3; flex-basis: 100%; max-width: 100% !important; }
      .drx-topbar-acciones { gap: 6px !important; }
      .drx-oculta-movil { display: none !important; }
      .drx-content-area { padding: 14px 14px 28px !important; }
      .drx-grid-form { grid-template-columns: 1fr !important; }
      .drx-tabla-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    }
  `}</style>
);

export function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: COLORS.inkSoft, fontFamily: "Inter, sans-serif" }}>
      {label}
      {children}
    </label>
  );
}

export const inputStyle = {
  border: `1px solid ${COLORS.border}`,
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 14,
  fontFamily: "Inter, sans-serif",
  color: COLORS.ink,
  background: COLORS.panel,
  outline: "none",
};

export const buttonPrimary = {
  background: `linear-gradient(135deg, #0F5540, ${COLORS.navy} 55%, ${COLORS.navyDeep})`,
  color: "#FFFFFF",
  border: "none",
  borderRadius: 10,
  padding: "11px 20px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "Inter, sans-serif",
  boxShadow: "0 2px 8px rgba(11,61,46,0.22), inset 0 1px 0 rgba(255,255,255,0.08)",
  letterSpacing: 0.1,
};

export const buttonGhost = {
  background: COLORS.panel,
  color: COLORS.ink,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 10,
  padding: "10px 18px",
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "Inter, sans-serif",
};

export const navLinkStyle = {
  fontFamily: "Inter, sans-serif",
  fontSize: 13,
  fontWeight: 600,
  color: COLORS.inkSoft,
  textDecoration: "none",
};

export const footerLinkStyle = {
  fontFamily: "Inter, sans-serif",
  fontSize: 12.5,
  color: "#D7E2F1",
  textDecoration: "none",
};

export function Card({ children, style, ...resto }) {
  return (
    <div
      className="drx-card"
      style={{
        background: COLORS.panel,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 14,
        padding: 20,
        ...style,
      }}
      {...resto}
    >
      {children}
    </div>
  );
}

export function Spinner({ texto = "Cargando…" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 0" }}>
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          border: `2.5px solid ${COLORS.border}`,
          borderTopColor: COLORS.accentBright,
          borderRightColor: "#14B8A6",
          display: "inline-block",
          animation: "drx-spin 0.7s linear infinite",
          filter: `drop-shadow(0 0 4px ${COLORS.accentBright}40)`,
        }}
      />
      <span style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.muted }}>{texto}</span>
    </div>
  );
}

// Textura de grano casi imperceptible (mismo recurso que ya usaba la
// landing) — reutilizada también dentro de la app ya logueada, para que se
// sienta parte de la misma marca en vez de una pantalla "de trabajo" aparte.
export function TexturaGrano() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 1,
        opacity: 0.035,
        mixBlendMode: "overlay",
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
      }}
    />
  );
}

// Número de versión que se sube a mano cada vez que se publica un cambio
// importante — junto con la fecha del build, deja ver de un vistazo si el
// navegador ya tiene la versión más nueva.
export const APP_VERSION = "1.193.0";

export function EstadoBadge({ estado }) {
  const config = {
    pendiente: { texto: "Pendiente de firma", bg: "#F0F0F0", color: COLORS.black, borde: "#D8D8D8", punto: COLORS.black },
    falta_abogado: { texto: "Firmado por el cliente · falta tu firma", bg: COLORS.accentSoft, color: COLORS.navy, borde: "#C7D6EA", punto: COLORS.accentBright },
    listo: { texto: "Listo · documento completo", bg: COLORS.navy, color: "#FFFFFF", borde: COLORS.navy, punto: "#FFFFFF" },
  }[estado];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        fontWeight: 600,
        padding: "4px 10px",
        borderRadius: 20,
        background: config.bg,
        color: config.color,
        fontFamily: "Inter, sans-serif",
        whiteSpace: "nowrap",
        border: `1px solid ${config.borde}`,
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: config.punto,
          animation: estado === "falta_abogado" ? "drx-pulse 1.8s ease-in-out infinite" : "none",
        }}
      />
      {config.texto}
    </span>
  );
}

// Supabase guarda la sesión en localStorage con la llave "sb-<proyecto>-auth-token".
// Mirarla de forma síncrona deja decidir, sin cargar la librería de Supabase,
// si quien abre la página tiene sesión (panel) o es un visitante (landing,
// portal del cliente): así esas páginas públicas no descargan el panel.
export function haySesionGuardada() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("sb-") && k.endsWith("-auth-token")) return true;
    }
  } catch {
    // sin acceso a localStorage: se asume sin sesión
  }
  return false;
}

const LLAVE_TEMA_LOCAL = "nomos-preferencia-tema";
function leerTemaLocal() {
  try {
    return localStorage.getItem(LLAVE_TEMA_LOCAL) === "oscuro";
  } catch {
    return false;
  }
}

// La preferencia se lee primero del navegador (al instante, sin parpadeo) y
// solo con sesión se sincroniza con la base; lib/storage se importa bajo
// demanda para que un visitante sin sesión no descargue Supabase por esto.
export function useTema() {
  const [oscuro, setOscuro] = useState(leerTemaLocal);
  useEffect(() => {
    if (!haySesionGuardada()) return;
    let cancelado = false;
    import("../lib/storage").then(({ storageGet }) => storageGet("preferencia-tema")).then((raw) => {
      if (cancelado || raw == null) return;
      setOscuro(raw === "oscuro");
      try {
        localStorage.setItem(LLAVE_TEMA_LOCAL, raw);
      } catch {
        // solo se pierde el atajo local
      }
    }).catch(() => {});
    return () => {
      cancelado = true;
    };
  }, []);
  // El fondo de la página (lo que se ve detrás de la barra de gestos del
  // iPhone o al estirar la pantalla) sigue el tema — antes quedaba blanco.
  useEffect(() => {
    document.documentElement.style.backgroundColor = oscuro ? "#10151D" : "#F4F6F9";
  }, [oscuro]);
  const alternar = async () => {
    const nuevo = !oscuro;
    const valor = nuevo ? "oscuro" : "claro";
    setOscuro(nuevo);
    try {
      localStorage.setItem(LLAVE_TEMA_LOCAL, valor);
    } catch {
      // sin localStorage queda solo en la base
    }
    if (haySesionGuardada()) {
      const { storageSet } = await import("../lib/storage");
      await storageSet("preferencia-tema", valor);
    }
  };
  return { oscuro, alternar };
}

export function IconoSol({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconoLuna({ size = 17 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 14.2A8.5 8.5 0 1 1 9.8 4a6.7 6.7 0 0 0 10.2 10.2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

export function Icono({ tipo, size = 15, style, className }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", className, style: { flexShrink: 0, ...style } };
  switch (tipo) {
    case "clip":
      return <svg {...p}><path d="M8 12.5V7a3 3 0 0 1 6 0v8a5 5 0 0 1-10 0V8" /></svg>;
    case "documento":
      return <svg {...p}><path d="M7 3h7l4 4v14H7Z" /><path d="M14 3v4h4" /><path d="M9.5 12.5h5M9.5 15.5h5" /></svg>;
    case "balanza":
      return <svg {...p}><path d="M12 3v18M6 8h12M6 8 3.5 13a2.5 2.5 0 0 0 5 0L6 8Zm12 0-2.5 5a2.5 2.5 0 0 0 5 0L18 8Z" /><path d="M8.5 21h7" /></svg>;
    case "mano":
      return <svg {...p}><path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 12V5a1.5 1.5 0 0 1 3 0v7M14 12.5V6.5a1.5 1.5 0 0 1 3 0v8" /><path d="M8 12.5v3a5.5 5.5 0 0 0 11 0V13" /></svg>;
    case "telefono":
      return <svg {...p}><path d="M6 3h3l1.5 4.5L8.5 9a11 11 0 0 0 6.5 6.5l1.5-2 4.5 1.5v3a2 2 0 0 1-2.2 2A18 18 0 0 1 4 5.2 2 2 0 0 1 6 3Z" /></svg>;
    case "chat":
      return <svg {...p}><path d="M4 4.5h16v12H9l-4 3.5v-3.5H4Z" /></svg>;
    case "refrescar":
      return <svg {...p}><path d="M20 11a8 8 0 0 0-14.6-4.5M4 4v5h5" /><path d="M4 13a8 8 0 0 0 14.6 4.5M20 20v-5h-5" /></svg>;
    case "foco":
      return <svg {...p}><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.9V16h5v-.2c0-.8.4-1.5 1-1.9A6 6 0 0 0 12 3Z" /></svg>;
    case "portapapeles":
      return <svg {...p}><rect x="6" y="4.5" width="12" height="16" rx="2" /><path d="M9.5 3.5h5v2.5h-5Z" /></svg>;
    case "compartir":
      return (
        <svg {...p}>
          <circle cx="18" cy="5.5" r="2.5" />
          <circle cx="6" cy="12" r="2.5" />
          <circle cx="18" cy="18.5" r="2.5" />
          <path d="M8.2 10.7 15.8 7M8.2 13.3l7.6 3.7" />
        </svg>
      );
    case "check":
      return <svg {...p}><path d="M5 12.5 10 17 19 7" /></svg>;
    case "ojo":
      return <svg {...p}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="2.6" /></svg>;
    case "ojoTachado":
      return <svg {...p}><path d="M3 3l18 18" /><path d="M10.6 5.7A9.9 9.9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a15.6 15.6 0 0 1-3.3 4.1M6.6 6.9C4.1 8.6 2.5 12 2.5 12S6 18.5 12 18.5c1.2 0 2.3-.2 3.3-.6" /><path d="M9.9 10a2.6 2.6 0 0 0 3.6 3.6" /></svg>;
    case "reloj":
      return <svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>;
    case "cronometro":
      return <svg {...p}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9.5 2.5h5M12 2.5V5" /></svg>;
    case "objetivo":
      return <svg {...p}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="0.8" fill="currentColor" /></svg>;
    case "apreton":
      return <svg {...p}><path d="M2.5 13 7 9l4 2 3-2.5 4.5 3.5-3 3.5-2-1.5-3 2Z" /><path d="M9 13l2.5 2.5M13.5 12l2.5 2.8" /></svg>;
    case "calendario":
      return <svg {...p}><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /></svg>;
    case "chispa":
      return <svg {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" /></svg>;
    case "lapiz":
      return <svg {...p}><path d="M4 17.5 14.5 7l2.5 2.5L6.5 20H4v-2.5Z" /><path d="M13 8.5l2.5 2.5" /></svg>;
    case "tarjeta":
      return <svg {...p}><rect x="2.5" y="5.5" width="19" height="13" rx="2" /><path d="M2.5 10h19M6 14.5h4" /></svg>;
    case "alerta":
      return <svg {...p}><path d="M12 3 22 20H2Z" /><path d="M12 9.5v4.5M12 17v.3" /></svg>;
    case "escudo":
      return <svg {...p}><path d="M12 3 19 6v5.5c0 5-3 8.4-7 9.5-4-1.1-7-4.5-7-9.5V6l7-3Z" /><path d="M8.7 12l2.3 2.3 4.3-4.6" /></svg>;
    case "sobre":
      return <svg {...p}><rect x="3" y="5.5" width="18" height="13" rx="2" /><path d="m3.5 6.5 8.5 7 8.5-7" /></svg>;
    case "bandeja":
      return <svg {...p}><path d="M3 12h5l2 3h4l2-3h5" /><path d="M5.5 6h13l2.5 6v7a1 1 0 0 1-1 1h-16a1 1 0 0 1-1-1v-7Z" /></svg>;
    case "llave":
      return <svg {...p}><circle cx="7.5" cy="14.5" r="4" /><path d="M10.5 11.5 20 2M16.5 5.5l3 3M14 8l2.5 2.5" /></svg>;
    case "edificio":
      return <svg {...p}><path d="M4 21h16M6 21V9l6-4 6 4v12" /><path d="M10 21v-5h4v5M9 12h1M14 12h1M9 15.5h1M14 15.5h1" /></svg>;
    case "persona":
      return <svg {...p}><circle cx="12" cy="8" r="3.5" /><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" /></svg>;
    case "imagen":
      return <svg {...p}><rect x="3" y="4.5" width="18" height="15" rx="2" /><circle cx="8.5" cy="10" r="1.7" /><path d="m4 18 5.5-5.5 3 3L18 10l3 4.5" /></svg>;
    case "papelera":
      return <svg {...p}><path d="M4.5 7h15M9 7V4.5h6V7" /><path d="M6.5 7 7.5 20a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1L17.5 7" /><path d="M10 11v6M14 11v6" /></svg>;
    case "cursorArriba":
      return <svg {...p}><path d="M12 19V6M6.5 11.5 12 6l5.5 5.5" /></svg>;
    case "lupa":
      return <svg {...p}><circle cx="10.5" cy="10.5" r="6.5" /><path d="m20 20-4.5-4.5" /></svg>;
    case "grafico":
      return <svg {...p}><path d="M4 20V10M11 20V4M18 20v-7" /><path d="M2.5 20h19" /></svg>;
    case "calculadora":
      return <svg {...p}><rect x="5" y="2.5" width="14" height="19" rx="2" /><path d="M8 6.5h8M8 11h1.5M8 14.5h1.5M8 18h1.5M12.25 11h1.5M12.25 14.5h1.5M12.25 18h1.5M16.5 11h1.5M16.5 14.5v3.5" /></svg>;
    case "ubicacion":
      return <svg {...p}><path d="M12 21s7-6.5 7-11.5A7 7 0 0 0 5 9.5C5 14.5 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.3" /></svg>;
    case "video":
      return <svg {...p}><rect x="2.5" y="6.5" width="13" height="11" rx="2" /><path d="m15.5 10.5 5-3v9l-5-3Z" /></svg>;
    case "ayuda":
      return <svg {...p}><circle cx="12" cy="12" r="9.5" /><path d="M9.2 9.2a2.8 2.8 0 1 1 3.9 2.6c-.8.4-1.1.9-1.1 1.7v.4" /><circle cx="12" cy="17" r="0.3" fill="currentColor" /></svg>;
    default:
      return null;
  }
}

export function BotonTema({ oscuro, onClick }) {
  return (
    <button
      className="drx-boton-tema"
      onClick={onClick}
      title={oscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      style={{
        background: "transparent",
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        width: 38,
        height: 38,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: COLORS.ink,
      }}
    >
      <span key={oscuro ? "sol" : "luna"} className="drx-boton-tema-icono">
        {oscuro ? <IconoSol /> : <IconoLuna />}
      </span>
    </button>
  );
}


export const ICONOS_TAB = {
  resumen: "M3 10.5 10 4l7 6.5M5 9v7h10V9",
  clientes: "M7 8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm7 1a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM2.5 16c.4-2.8 2.3-4.5 4.5-4.5s4.1 1.7 4.5 4.5M12 11.7c1.9.2 3.2 1.6 3.5 3.8",
  vigilancia: "M10 3v14M6 6h8M6 6 3 11.5a3 3 0 0 0 6 0L6 6Zm8 0-3 5.5a3 3 0 0 0 6 0L14 6ZM6.5 17h7",
  contabilidad: "M2.5 6.5h15v9h-15v-9Zm0 2.8h15M5.5 12.7h3",
  contenido: "M4 4.5h12v12H4v-12Zm0 3.3h12M7 3v3M13 3v3M6.5 11h2M11.5 11h2M6.5 14h2M11.5 14h2",
  documentos: "M6 3.5h6l3 3v10h-9v-13Zm6 0v3h3M8 10.5l4-1-1 4-4 1 1-4Z",
  reportes: "M4 16.5v-6M9 16.5v-10M14 16.5v-3.5M2.5 16.5h15",
  agenda: "M3.5 5h13v11h-13v-11ZM3.5 8.5h13M7 3v3M13 3v3M6.5 11.5h2M11.5 11.5h2",
  usuarios: "M10 12.7a2.7 2.7 0 1 0 0-5.4 2.7 2.7 0 0 0 0 5.4Zm7-2.7a7 7 0 0 1-.1 1.2l1.6 1.2-1.5 2.6-1.9-.7c-.4.3-.9.6-1.4.8l-.3 2H8.6l-.3-2c-.5-.2-1-.5-1.4-.8l-1.9.7-1.5-2.6 1.6-1.2A7 7 0 0 1 5 10c0-.4 0-.8.1-1.2L3.5 7.6l1.5-2.6 1.9.7c.4-.3.9-.6 1.4-.8l.3-2h2.8l.3 2c.5.2 1 .5 1.4.8l1.9-.7 1.5 2.6-1.6 1.2c.1.4.1.8.1 1.2Z",
  calculadora: "M5 2.5h10v15H5v-15Zm0 4.2h10M7 10h1M7 12.5h1M7 15h1M9.7 10h1M9.7 12.5h1M9.7 15h1M12.4 10h1M12.4 12.5v2.5",
  antecedentes: "M3 5.5h14v9H3v-9Zm4 2.3a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2ZM4.7 13.8c.3-1.5 1.3-2.3 2.3-2.3s2 .8 2.3 2.3M11.5 8.3h4M11.5 10.7h4M11.5 13.1h2.3",
};

export function IconoTab({ tipo }) {
  const d = ICONOS_TAB[tipo];
  if (!d) return null;
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

// Revela su contenido con un fade + slide hacia arriba la primera vez que
// entra en el viewport — usado en la landing para que la página se sienta
// viva al hacer scroll, en vez de estática.
export function AlEntrar({ children, retraso = 0, style }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entrada]) => {
        if (entrada.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(22px)",
        transition: `opacity 0.6s ease ${retraso}ms, transform 0.6s ease ${retraso}ms`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// Vista previa animada del panel real usada en el hero de la landing:
// alterna sola cada pocos segundos entre dos "pantallas" (Resumen, y
// Vigilancia + Firmas) para mostrar más del producto sin que el visitante
// tenga que hacer nada.
export function VistaPreviaAnimada() {
  const [pantalla, setPantalla] = useState(0);

  useEffect(() => {
    const intervalo = setInterval(() => setPantalla((p) => (p + 1) % 2), 4200);
    return () => clearInterval(intervalo);
  }, []);

  const tabs = ["resumen", "clientes", "vigilancia", "contabilidad", "documentos"];
  const tabActivo = pantalla === 0 ? "resumen" : "vigilancia";

  return (
    <div style={{ maxWidth: 780, margin: "44px auto 0", animation: "drx-float 6s ease-in-out infinite" }}>
      <div
        style={{
          background: COLORS.navy,
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 30px 70px rgba(11,61,46,0.4)",
          border: "1px solid #143c72",
          textAlign: "left",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderBottom: "1px solid #143c72" }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#F5A524" }} />
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#F43F5E" }} />
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#10B981" }} />
          <span style={{ marginLeft: 10, fontFamily: "Inter, sans-serif", fontSize: 11, color: "#7C93B8" }}>nomos — panel del despacho</span>
        </div>
        <div style={{ display: "flex", minHeight: 260 }}>
          <div style={{ width: 46, background: "#0d3524", padding: "16px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 16, flexShrink: 0 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.navy }}>
              <IconoNomos size={16} />
            </div>
            {tabs.map((tab) => (
              <div
                key={tab}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: tab === tabActivo ? COLORS.accentBright : "transparent",
                  color: tab === tabActivo ? "#FFFFFF" : "#7C93B8",
                  transition: "background 0.3s ease",
                }}
              >
                <IconoTab tipo={tab} />
              </div>
            ))}
          </div>
          <div style={{ flex: 1, padding: "18px 20px" }}>
            {pantalla === 0 ? (
              <div key="pantalla-resumen" className="drx-fade-in">
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: "#9FB6D6", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Resumen de hoy
                </p>
                <div className="drx-grid-form" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
                  {[
                    { etiqueta: "Recaudado hoy", valor: "$2.4M", color: "#14B8A6" },
                    { etiqueta: "Clientes activos", valor: "38", color: "#8B5CF6" },
                    { etiqueta: "Con novedad", valor: "3", color: "#F5A524" },
                  ].map((s) => (
                    <div key={s.etiqueta} style={{ background: "#0d3524", borderRadius: 10, padding: "10px 12px" }}>
                      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 9.5, color: "#9FB6D6", margin: 0 }}>{s.etiqueta}</p>
                      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 17, fontWeight: 800, color: s.color, margin: "3px 0 0" }}>{s.valor}</p>
                    </div>
                  ))}
                </div>
                <div style={{ background: "#0d3524", borderRadius: 10, padding: "12px 14px", display: "flex", alignItems: "flex-end", gap: 8, height: 78 }}>
                  {[38, 55, 44, 70, 60, 82, 68].map((h, i) => (
                    <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: 3, background: i === 5 ? COLORS.accentBright : "#1e5fb4" }} />
                  ))}
                </div>
              </div>
            ) : (
              <div key="pantalla-vigilancia" className="drx-fade-in">
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: "#9FB6D6", margin: "0 0 12px", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Vigilancia judicial y firmas
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                  {[
                    { nombre: "Proceso 2024-00187", estado: "Con novedad", color: "#F5A524" },
                    { nombre: "Proceso 2023-00542", estado: "En trámite", color: "#2F80ED" },
                  ].map((p) => (
                    <div key={p.nombre} style={{ background: "#0d3524", borderRadius: 8, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontFamily: "monospace", fontSize: 11, color: "#D7E2F1" }}>{p.nombre}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "Inter, sans-serif", fontSize: 9.5, fontWeight: 700, color: p.color }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: p.color }} />
                        {p.estado}
                      </span>
                    </div>
                  ))}
                </div>
                <div style={{ background: "#0d3524", borderRadius: 10, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#10B981", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ color: "#FFFFFF", fontWeight: 800, fontSize: 14 }}>✓</span>
                  </div>
                  <div>
                    <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 700, color: "#FFFFFF", margin: 0 }}>Contrato firmado electrónicamente</p>
                    <p style={{ fontFamily: "Inter, sans-serif", fontSize: 9.5, color: "#9FB6D6", margin: "2px 0 0" }}>Cliente y abogado · con hash de integridad</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 14 }}>
        {[0, 1].map((i) => (
          <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: pantalla === i ? COLORS.accentBright : "#C7D6EA", transition: "background 0.3s ease" }} />
        ))}
      </div>
      <p
        style={{
          fontFamily: "Inter, sans-serif",
          fontSize: 12.5,
          color: COLORS.muted,
          textAlign: "center",
          marginTop: 10,
        }}
      >
        Clientes · Vigilancia judicial · Firma electrónica · Contabilidad · Contenido con IA
      </p>
    </div>
  );
}

// Pequeña etiqueta en mayúsculas arriba de un <h2> — le da a cada sección de
// la landing la misma jerarquía tipográfica de "kicker" que usan las páginas
// de producto más cuidadas, en vez de que cada título flote solo.
export function Kicker({ texto }) {
  return (
    <p
      style={{
        fontFamily: "Inter, sans-serif",
        fontSize: 11,
        fontWeight: 800,
        letterSpacing: 1.4,
        textTransform: "uppercase",
        color: COLORS.accentBright,
        textAlign: "center",
        margin: "0 0 8px",
      }}
    >
      {texto}
    </p>
  );
}

export function fechaHoyISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

// Marca de Nomos: un documento con la esquina doblada (expediente, contrato)
// y un check dinámico atravesándolo en diagonal — evoca el trabajo real del
// despacho (documentos, firma electrónica, casos resueltos) sin caer en los
// clichés visuales del sector (balanza, martillo, columna). El check está
// "recortado" del documento con fill-rule evenodd, así que funciona igual de
// bien en cualquier fondo (caja de color, tarjeta blanca, marca de agua).
export function IconoNomos({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        fillRule="evenodd"
        fill="currentColor"
        d="M7.2,3 H13.8 L18,7.2 V17.8 A2.2,2.2 0 0 1 15.8,20 H7.2 A2.2,2.2 0 0 1 5,17.8 V5.2 A2.2,2.2 0 0 1 7.2,3 Z M8.03,15.11 L10.54,17.73 L12.14,17.63 L17.62,10.39 L15.94,9.13 L10.46,16.37 L12.06,16.27 L9.55,13.65 Z"
      />
    </svg>
  );
}

// Antes, mientras se verificaba la sesión (getUser + perfil, un par de
// viajes al servidor — ver cargarPerfilActual), la pantalla se quedaba
// completamente en blanco: sin logo, sin ningún indicio de que algo estaba
// pasando. Se sentía como que la app "no cargaba", cuando en realidad sí
// estaba trabajando. Esta pantalla se ve solo ese instante inicial.
export function PantallaCargaInicial() {
  return (
    <div
      style={{
        minHeight: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        background: `linear-gradient(155deg, ${COLORS.navy} 0%, ${COLORS.navyDeep} 100%)`,
      }}
    >
      <div style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 48, height: 48, borderRadius: 13, background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.navy, flexShrink: 0 }}>
          <IconoNomos size={26} />
        </div>
        <span style={{ fontFamily: "Inter, sans-serif", fontSize: 26, fontWeight: 800, letterSpacing: 2, color: "#FFFFFF", lineHeight: 1 }}>Nomos</span>
      </div>
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          border: "2.5px solid rgba(255,255,255,0.25)",
          borderTopColor: "#FFFFFF",
          display: "inline-block",
          animation: "drx-spin 0.7s linear infinite",
        }}
      />
      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: "#CFE0D6", margin: 0 }}>Cargando…</p>
    </div>
  );
}

// Mismo espíritu que PantallaCargaInicial (logo + spinner, no una pantalla
// en blanco) pero para adentro de la app — cada pestaña que se carga con
// React.lazy (ver PRECARGA_TAB) muestra esto mientras descarga su chunk, en
// vez del spinner genérico y chiquito de antes. El fondo es claro y con
// menos altura porque aquí sí sigue viéndose el menú lateral al lado.
export function CargandoSeccion() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: "70px 0" }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: COLORS.navy, display: "flex", alignItems: "center", justifyContent: "center", color: "#FFFFFF", flexShrink: 0 }}>
          <IconoNomos size={19} />
        </div>
        <span style={{ fontFamily: "Inter, sans-serif", fontSize: 17, fontWeight: 800, letterSpacing: 1.2, color: COLORS.headingText, lineHeight: 1 }}>Nomos</span>
      </div>
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          border: `2.5px solid ${COLORS.border}`,
          borderTopColor: COLORS.accentBright,
          display: "inline-block",
          animation: "drx-spin 0.7s linear infinite",
        }}
      />
      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted, margin: 0 }}>Cargando…</p>
    </div>
  );
}

export function InsigniaPlataforma({ grande }) {
  const tamañoIcono = grande ? 26 : 15;
  const cajaIcono = grande ? 46 : 28;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: grande ? 12 : 8, marginBottom: 20 }}>
      <div
        style={{
          width: cajaIcono,
          height: cajaIcono,
          borderRadius: grande ? 13 : 8,
          background: COLORS.navy,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#FFFFFF",
          flexShrink: 0,
        }}
      >
        <IconoNomos size={tamañoIcono} />
      </div>
      <span style={{ fontFamily: "Inter, sans-serif", fontSize: grande ? 26 : 14, fontWeight: 800, letterSpacing: grande ? 2 : 1.5, color: COLORS.headingText, lineHeight: 1 }}>
        Nomos
      </span>
    </div>
  );
}

export const PLANES_PRECIO = [
  {
    nombre: "Abogado",
    precio: "$80.000",
    periodo: "/mes (1 abogado)",
    descripcion: "Para el abogado independiente que quiere dejar el Excel y el WhatsApp desordenado.",
    caracteristicas: ["1 usuario", "Hasta 30 clientes activos", "Firma electrónica de documentos", "Vigilancia judicial automática", "Portal del cliente"],
    destacado: false,
  },
  {
    nombre: "Despacho",
    precio: "$120.000",
    periodo: "/mes",
    descripcion: "Para despachos con varios abogados que necesitan trabajar coordinados.",
    caracteristicas: ["Usuarios ilimitados", "Clientes ilimitados", "Todas las funciones de Abogado", "Reportes y carga de trabajo por abogado", "Roles y permisos por usuario", "Soporte prioritario"],
    destacado: true,
  },
];

export const FUNCIONES_LANDING = [
  { titulo: "Resumen", color: "#2F80ED", iconoTab: "resumen", texto: "Lo que necesita tu atención hoy, en un solo panel." },
  { titulo: "Agenda + Google Calendar", color: "#8B5CF6", iconoTab: "agenda", texto: "Cada evento se crea también en tu Google Calendar, con link de Meet listo para compartir." },
  { titulo: "Clientes", color: "#14B8A6", iconoTab: "clientes", texto: "Ficha completa por cliente, con búsqueda instantánea." },
  { titulo: "Vigilancia judicial", color: "#F5A524", iconoTab: "vigilancia", texto: "La Rama Judicial, consultada y explicada por IA." },
  { titulo: "Antecedentes", color: "#6366F1", iconoTab: "antecedentes", texto: "RUES, antecedentes judiciales, fiscales y más, en un solo lugar." },
  { titulo: "Contabilidad", color: "#F43F5E", iconoTab: "contabilidad", texto: "Pagos, recibos y cobros listos para WhatsApp." },
  { titulo: "Firmar documentos", color: "#10B981", iconoTab: "documentos", texto: "Firma electrónica desde el celular, sin instalar nada." },
  { titulo: "Portal del cliente", color: "#2F80ED", iconoTab: "usuarios", texto: "Tus clientes consultan su caso sin llamarte." },
  { titulo: "Reportes", color: "#0EA5E9", iconoTab: "reportes", texto: "Ingresos y carga de trabajo, con datos reales." },
];

// Íconos de línea propios (mismo lenguaje visual que IconoTab) para la
// sección de Seguridad de la landing — sin usar emojis, que en algunos
// sistemas se ven a color y desentonan con el resto del diseño monocromo.
export function IconoSeguridad({ tipo, size = 18 }) {
  const props = { width: size, height: size, viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (tipo) {
    case "candado":
      return (
        <svg {...props}>
          <rect x="5" y="9" width="10" height="8" rx="1.5" />
          <path d="M7 9V6a3 3 0 0 1 6 0v3" />
        </svg>
      );
    case "aislamiento":
      return (
        <svg {...props}>
          <rect x="3" y="3" width="6" height="6" rx="1" />
          <rect x="11" y="11" width="6" height="6" rx="1" />
        </svg>
      );
    case "auditoria":
      return (
        <svg {...props}>
          <path d="M6 3h6l3 3v11H6V3Z" />
          <path d="M8 9.5h4M8 12.5h4M8 15h2" />
        </svg>
      );
    case "escudo":
      return (
        <svg {...props}>
          <path d="M10 2.5 16 5v4.5c0 4-2.5 6.7-6 7.5-3.5-.8-6-3.5-6-7.5V5l6-2.5Z" />
          <path d="M7.3 10 9 11.7 12.7 8" />
        </svg>
      );
    case "descarga":
      return (
        <svg {...props}>
          <path d="M10 3v8" />
          <path d="M6.7 8 10 11.3 13.3 8" />
          <path d="M4.5 16.5h11" />
        </svg>
      );
    case "transito":
      return (
        <svg {...props}>
          <path d="M3.5 10h13" />
          <path d="M3.5 10l3.2-3.2M3.5 10l3.2 3.2" />
          <path d="M16.5 10l-3.2-3.2M16.5 10l-3.2 3.2" />
        </svg>
      );
    case "reloj":
      return (
        <svg {...props}>
          <circle cx="10" cy="10" r="7.2" />
          <path d="M10 6v4l3 2" />
        </svg>
      );
    case "firma":
      return (
        <svg {...props}>
          <path d="M4 15.7 13 6.7a1.4 1.4 0 0 1 2 2L6 17.7H4v-2Z" />
          <path d="M3 17.7h13.5" />
        </svg>
      );
    default:
      return null;
  }
}

export const ICONOS_SEGURIDAD_ORDEN = ["candado", "aislamiento", "auditoria", "escudo", "descarga", "transito", "reloj", "firma"];

export const SEGURIDAD_LANDING = [
  { titulo: "Autenticación real", texto: "Contraseñas cifradas, nunca en texto plano." },
  { titulo: "Aislamiento total", texto: "Cada despacho ve solo lo suyo." },
  { titulo: "Registro de auditoría", texto: "Constancia de cada acción realizada." },
  { titulo: "Freno a ataques", texto: "Espera automática tras intentos fallidos." },
  { titulo: "Respaldo descargable", texto: "Tu información, exportable cuando quieras." },
  { titulo: "Conexión cifrada", texto: "Toda la conexión viaja protegida." },
  { titulo: "Sesión con vencimiento", texto: "Se cierra sola si la dejas abierta." },
  { titulo: "Firma verificable", texto: "Cada firma queda con huella digital." },
];
