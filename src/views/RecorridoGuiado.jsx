import { useState, useEffect, useLayoutEffect } from "react";
import { NUMERO_WHATSAPP_DESPACHO } from "../App.jsx";

// Recorrido guiado obligatorio la primera vez que entra un usuario nuevo:
// va sección por sección, abre cada una y la señala en el menú con una
// explicación corta. No se puede saltar; al terminarlo no vuelve a salir
// (las dudas posteriores van a soporte).

const PASOS_SECCIONES = [
  { id: "resumen", titulo: "Resumen", texto: "Tu tablero de inicio: lo urgente del día, próximas citas, términos por vencer, pagos pendientes y novedades judiciales, todo en una sola vista." },
  { id: "agenda", titulo: "Agenda", texto: "Crea citas, audiencias y recordatorios. Se pueden sincronizar con Google Calendar y llevar enlace de Google Meet automático." },
  { id: "clientes", titulo: "Clientes", texto: "La ficha de cada cliente: datos, radicados, plan de pagos, línea de tiempo del caso y el botón para compartirle su portal privado." },
  { id: "vigilancia", titulo: "Vigilancia judicial", texto: "Nomos revisa tus radicados en la Rama Judicial y te avisa cuando hay una actuación nueva, sin que tengas que entrar a buscar." },
  { id: "antecedentes", titulo: "Antecedentes", texto: "Las 7 consultas oficiales (Policía, Procuraduría, Contraloría, RUES, RUNT, RNMC y SIMIT): escribe el dato, cópialo y abre el portal oficial." },
  { id: "contabilidad", titulo: "Contabilidad", texto: "Registra pagos con su recibo, controla saldos, cuotas y gastos del despacho, y envía recibos por WhatsApp." },
  { id: "calculadora", titulo: "Calculadora de precios", texto: "Calcula honorarios y arma la propuesta de pago con anticipo y cuotas antes de cerrar con un cliente." },
  { id: "contenido", titulo: "Calendario de contenido", texto: "Planea las publicaciones de redes sociales del despacho y genera ideas con IA." },
  { id: "documentos", titulo: "Firmar documentos", texto: "Crea contratos y poderes y envíalos a firmar electrónicamente con validez legal (Ley 527 de 1999)." },
  { id: "reportes", titulo: "Reportes", texto: "Indicadores del despacho: ingresos, clientes, procesos y rendimiento del equipo." },
  { id: "usuarios", titulo: "Usuarios y permisos", texto: "Invita a tu equipo y decide qué secciones puede ver cada persona." },
];

const PASOS_HERRAMIENTAS = [
  { id: "buscar", titulo: "Buscador", texto: "Encuentra cualquier cliente o documento al instante. Atajo: Ctrl + K." },
  { id: "ayuda", titulo: "Guía de Nomos", texto: "La guía completa con el paso a paso de cada función y el registro de novedades." },
];

export function construirPasosRecorrido({ puedeVer, esAdmin, nombre }) {
  const primer = (nombre || "").trim().split(/\s+/)[0];
  return [
    { id: null, titulo: `¡Bienvenido a Nomos${primer ? `, ${primer}` : ""}!`, texto: "Te mostramos en 2 minutos para qué sirve cada sección. Avanza con «Siguiente» o con las flechas del teclado." },
    ...PASOS_SECCIONES.filter((p) => (p.id === "usuarios" ? esAdmin : puedeVer(p.id))).map((p) => ({ ...p, seccion: p.id })),
    ...PASOS_HERRAMIENTAS,
    { id: null, titulo: "¡Listo, ya conoces Nomos!", texto: "Si tienes dudas más adelante, escríbele a soporte por WhatsApp. Este recorrido no vuelve a aparecer.", final: true },
  ];
}

export default function RecorridoGuiado({ pasos, onIrSeccion, onTerminar }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const [ancho, setAncho] = useState(() => window.innerWidth);
  const paso = pasos[i];
  const movil = ancho < 900;

  useEffect(() => {
    if (paso.seccion) onIrSeccion(paso.seccion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  useLayoutEffect(() => {
    const medir = () => {
      setAncho(window.innerWidth);
      const el = paso.id && document.querySelector(`[data-tour="${paso.id}"]`);
      const r = el?.getBoundingClientRect();
      setRect(r && r.width > 0 && r.left >= 0 && r.left < window.innerWidth ? r : null);
    };
    const el = paso.id && document.querySelector(`[data-tour="${paso.id}"]`);
    el?.scrollIntoView?.({ block: "nearest" });
    medir();
    const t = setTimeout(medir, 250);
    window.addEventListener("resize", medir);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", medir);
    };
  }, [i, paso.id]);

  const siguiente = () => (i < pasos.length - 1 ? setI(i + 1) : onTerminar());
  const atras = () => i > 0 && setI(i - 1);

  useEffect(() => {
    const tecla = (e) => {
      if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        siguiente();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        atras();
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  const pad = 6;
  const hueco = rect && !movil ? { left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 } : null;
  const ANCHO_TARJETA = 360;
  let posTarjeta;
  if (hueco) {
    const derecha = hueco.left + hueco.width + 18;
    if (derecha + ANCHO_TARJETA < window.innerWidth) posTarjeta = { left: derecha, top: Math.max(16, Math.min(hueco.top - 10, window.innerHeight - 280)) };
    else posTarjeta = { left: Math.max(16, Math.min(hueco.left, window.innerWidth - ANCHO_TARJETA - 16)), top: Math.min(hueco.top + hueco.height + 14, window.innerHeight - 280) };
  }
  const fuente = { fontFamily: "Inter, sans-serif" };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 10000 }} role="dialog" aria-modal="true" aria-label="Recorrido por Nomos">
      {hueco ? (
        <div style={{ position: "fixed", ...hueco, borderRadius: 14, boxShadow: "0 0 0 9999px rgba(4,19,17,0.68)", outline: "3px solid #C9A24B", transition: "all .3s ease", pointerEvents: "none" }} />
      ) : (
        <div style={{ position: "fixed", inset: 0, background: "rgba(4,19,17,0.68)" }} />
      )}
      <div
        style={{
          position: "fixed",
          ...(posTarjeta || (movil ? { left: 16, right: 16, bottom: "calc(16px + var(--sab, 0px))" } : { left: "50%", top: "50%", transform: "translate(-50%, -50%)" })),
          width: posTarjeta || !movil ? ANCHO_TARJETA : undefined,
          maxWidth: "calc(100vw - 32px)",
          background: "#FFFFFF",
          color: "#13302F",
          borderRadius: 18,
          padding: 20,
          boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
          transition: "all .3s ease",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ ...fuente, fontSize: 11, fontWeight: 800, letterSpacing: 1.4, color: "#3E7C7C", textTransform: "uppercase" }}>
            Paso {i + 1} de {pasos.length}
          </span>
        </div>
        <div style={{ height: 4, borderRadius: 4, background: "#E8EEEC", overflow: "hidden", marginBottom: 14 }}>
          <div style={{ height: "100%", width: `${((i + 1) / pasos.length) * 100}%`, background: "linear-gradient(90deg,#3E7C7C,#C9A24B)", transition: "width .3s ease" }} />
        </div>
        <p style={{ ...fuente, fontSize: 18, fontWeight: 800, margin: 0 }}>{paso.titulo}</p>
        <p style={{ ...fuente, fontSize: 14, lineHeight: 1.55, color: "#3D5452", margin: "8px 0 0" }}>{paso.texto}</p>
        {paso.final && (
          <a
            href={`https://wa.me/${NUMERO_WHATSAPP_DESPACHO}?text=${encodeURIComponent("Hola, tengo una duda sobre Nomos.")}`}
            target="_blank"
            rel="noreferrer"
            style={{ ...fuente, display: "inline-block", marginTop: 12, fontSize: 13, fontWeight: 700, color: "#1DA851", textDecoration: "none" }}
          >
            Soporte por WhatsApp ↗
          </a>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18, gap: 10 }}>
          <button
            type="button"
            onClick={atras}
            disabled={i === 0}
            style={{ ...fuente, background: "none", border: "1px solid #D9E2E0", borderRadius: 10, padding: "9px 14px", fontSize: 13, fontWeight: 700, color: "#13302F", cursor: i === 0 ? "default" : "pointer", opacity: i === 0 ? 0.4 : 1 }}
          >
            ← Atrás
          </button>
          <button
            type="button"
            onClick={siguiente}
            autoFocus
            style={{ ...fuente, background: "linear-gradient(135deg,#3E7C7C,#2C5858)", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 13.5, fontWeight: 800, color: "#FFFFFF", cursor: "pointer" }}
          >
            {paso.final ? "Empezar a usar Nomos" : "Siguiente →"}
          </button>
        </div>
      </div>
    </div>
  );
}
