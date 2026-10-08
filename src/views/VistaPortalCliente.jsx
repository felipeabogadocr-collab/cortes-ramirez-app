import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  COLORS,
  Field,
  Icono,
  IconoNomos,
  COLOR_AREA_PROCESO,
  buttonPrimary,
  inputStyle,
  consultarRamaJudicial,
  formatoCOP,
} from "../App.jsx";

// Portal del cliente: lo que ve el cliente final con su código de acceso.
// Todo sale del RPC obtener_portal_cliente (security definer, sin notas
// internas) y, para el estado judicial, de la consulta pública de la Rama.

const VERDE_PROFUNDO = "#0B3B33";
const DORADO = "#C9A24B";
const fuente = { fontFamily: "Inter, sans-serif" };

const aFecha = (f) => {
  if (!f) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(f) ? `${f}T12:00:00` : f);
  return isNaN(d) ? null : d;
};
const fechaLarga = (f) => aFecha(f)?.toLocaleDateString("es-CO", { dateStyle: "long" }) || f || "";
const fechaCorta = (f) => aFecha(f)?.toLocaleDateString("es-CO", { day: "numeric", month: "short" }) || "";
const mesAnio = (f) => aFecha(f)?.toLocaleDateString("es-CO", { month: "long", year: "numeric" }) || "";
function haceCuanto(f) {
  const d = aFecha(f);
  if (!d) return "";
  const dias = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 30) return `hace ${dias} días`;
  const meses = Math.floor(dias / 30);
  return meses === 1 ? "hace 1 mes" : meses < 12 ? `hace ${meses} meses` : `hace ${Math.floor(meses / 12)} año${meses >= 24 ? "s" : ""}`;
}
function diasHasta(f) {
  const d = aFecha(f);
  if (!d) return null;
  const hoy = new Date();
  hoy.setHours(12, 0, 0, 0);
  return Math.round((d.getTime() - hoy.getTime()) / 86400000);
}
function numeroWhatsapp(celular) {
  const d = String(celular || "").replace(/\D/g, "");
  if (!d) return "";
  return d.length === 10 ? `57${d}` : d;
}

// Etapas generales de un proceso. Se infiere en cuál va a partir de lo que
// hay registrado (radicado, actuaciones y su texto); es orientativo.
const ETAPAS = [
  { titulo: "Estudio del caso", detalle: "Tu abogado revisa los hechos, las pruebas y la estrategia." },
  { titulo: "Radicación", detalle: "La demanda o solicitud se presenta ante la autoridad." },
  { titulo: "En trámite", detalle: "El juzgado o la entidad avanza con autos, notificaciones y audiencias." },
  { titulo: "Decisión", detalle: "Se profiere sentencia o decisión de fondo." },
];
function etapaActual(cliente, ramaInfo) {
  const textos = [...(ramaInfo?.actuaciones || []).map((a) => `${a.actuacion} ${a.anotacion || ""}`), ...(cliente.actuaciones || []).map((a) => a.nota)].join(" ").toLowerCase();
  if (/sentencia|fallo|decisi[oó]n de fondo|archiv/.test(textos)) return 3;
  if ((ramaInfo?.actuaciones || []).length > 1 || /audiencia|admite|admisi[oó]n|traslado|notific/.test(textos)) return 2;
  if (cliente.radicado) return 1;
  return 0;
}

const GLOSARIO = [
  ["Auto", "Decisión del juez para impulsar el proceso (admitir, pedir pruebas, fijar fechas). No es la sentencia."],
  ["Admisión de la demanda", "El juzgado aceptó estudiar el caso. A partir de aquí se notifica a la otra parte."],
  ["Notificación", "El acto formal con el que se le informa a una parte sobre una decisión del proceso."],
  ["Traslado", "Plazo que se da a una parte para que conozca un escrito y se pronuncie."],
  ["Fijación en estado", "Publicación oficial de una decisión del juzgado. Desde ahí corren los términos."],
  ["Al despacho", "El expediente está en manos del juez, pendiente de que tome una decisión."],
  ["Audiencia", "Reunión ante el juez donde se practican pruebas o se escuchan a las partes."],
  ["Sentencia", "La decisión de fondo que resuelve el caso. Puede apelarse dentro del término legal."],
];

const PREGUNTAS = [
  ["¿Cada cuánto se actualiza esta información?", "El estado en la Rama Judicial se consulta en vivo cada vez que entras. Las novedades las escribe tu abogado cuando hay avances."],
  ["¿Por qué el proceso tarda tanto?", "Los tiempos los marca el juzgado o la entidad, no el despacho. Es normal que pasen semanas entre una actuación y otra."],
  ["¿Mi información está segura?", "Sí. Solo se ve con tu código personal, y tus datos se tratan según la Ley 1581 de 2012 de protección de datos."],
  ["¿Qué hago si cambia mi teléfono o correo?", "Escríbele a tu abogado con el botón de WhatsApp para que actualice tus datos."],
];

function Tarjeta({ children, style, id }) {
  return (
    <section
      id={id}
      style={{
        background: COLORS.panel,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 20,
        padding: 20,
        boxShadow: "0 1px 2px rgba(16,24,40,0.04), 0 12px 32px -12px rgba(11,59,51,0.18)",
        ...style,
      }}
    >
      {children}
    </section>
  );
}

function Encabezado({ icono, color, titulo, subtitulo, accion }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          flexShrink: 0,
          background: `linear-gradient(135deg, ${color}, ${color}B3)`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#FFFFFF",
          boxShadow: `0 6px 14px -4px ${color}80`,
        }}
      >
        <Icono tipo={icono} size={18} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ ...fuente, fontSize: 15.5, fontWeight: 800, color: COLORS.headingText, margin: 0, letterSpacing: -0.2 }}>{titulo}</p>
        {subtitulo && <p style={{ ...fuente, fontSize: 12, color: COLORS.muted, margin: "2px 0 0" }}>{subtitulo}</p>}
      </div>
      {accion}
    </div>
  );
}

function Chip({ children, color = COLORS.inkSoft, fondo = COLORS.surfaceSoft, borde = COLORS.border }) {
  return (
    <span style={{ ...fuente, display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: fondo, color, border: `1px solid ${borde}`, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function Anillo({ porcentaje, size = 92, grosor = 9, color = DORADO, fondo = "rgba(255,255,255,0.15)", children }) {
  const r = (size - grosor) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke={fondo} strokeWidth={grosor} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={grosor} fill="none" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, porcentaje) / 100)} style={{ transition: "stroke-dashoffset .8s ease" }} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>{children}</div>
    </div>
  );
}

function BotonAccion({ href, onClick, icono, children, color = "#1DA851", variante = "lleno", style }) {
  const base = {
    ...fuente,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: "11px 16px",
    borderRadius: 12,
    fontSize: 13.5,
    fontWeight: 700,
    textDecoration: "none",
    cursor: "pointer",
    boxSizing: "border-box",
    border: variante === "lleno" ? "none" : `1px solid ${COLORS.border}`,
    background: variante === "lleno" ? color : COLORS.panel,
    color: variante === "lleno" ? "#FFFFFF" : COLORS.ink,
    boxShadow: variante === "lleno" ? `0 8px 18px -8px ${color}` : "none",
    ...style,
  };
  const contenido = (
    <>
      {icono && <Icono tipo={icono} size={15} />}
      {children}
    </>
  );
  return href ? (
    <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" style={base}>
      {contenido}
    </a>
  ) : (
    <button type="button" onClick={onClick} style={base}>
      {contenido}
    </button>
  );
}

function Desplegable({ titulo, children }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div style={{ borderBottom: `1px solid ${COLORS.border}` }}>
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        style={{ ...fuente, width: "100%", background: "none", border: "none", padding: "13px 0", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, cursor: "pointer", color: COLORS.ink, fontSize: 13.5, fontWeight: 700, textAlign: "left" }}
      >
        {titulo}
        <span style={{ color: COLORS.muted, transform: abierto ? "rotate(45deg)" : "none", transition: "transform .2s", fontSize: 18, lineHeight: 1 }}>+</span>
      </button>
      {abierto && <p style={{ ...fuente, fontSize: 13, color: COLORS.inkSoft, margin: "0 0 14px", lineHeight: 1.55 }}>{children}</p>}
    </div>
  );
}

const PESTANAS = [
  { id: "resumen", titulo: "Resumen", icono: "grafico" },
  { id: "proceso", titulo: "Proceso", icono: "balanza" },
  { id: "pagos", titulo: "Pagos", icono: "tarjeta" },
  { id: "documentos", titulo: "Documentos", icono: "clip" },
  { id: "ayuda", titulo: "Ayuda", icono: "ayuda" },
];

export default function VistaPortalCliente() {
  const [codigo, setCodigo] = useState("");
  const [cliente, setCliente] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [pestana, setPestana] = useState("resumen");
  const [logoUrl, setLogoUrl] = useState("");

  const [ramaInfo, setRamaInfo] = useState(null);
  const [consultandoRama, setConsultandoRama] = useState(false);
  const [errorRama, setErrorRama] = useState("");
  const [verTodasRama, setVerTodasRama] = useState(false);
  const [descargandoRecibo, setDescargandoRecibo] = useState(null);
  const [errorRecibo, setErrorRecibo] = useState("");
  const [copiado, setCopiado] = useState("");

  // El link que el despacho comparte por WhatsApp ya trae el código
  // (?codigo=...#portal): el cliente entra directo. Se borra de la barra
  // de direcciones apenas se lee.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const desdeLink = (params.get("codigo") || "").trim();
    if (!desdeLink) return;
    window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    setCodigo(desdeLink);
    buscar(desdeLink);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buscar = async (codigoDirecto) => {
    const code = (typeof codigoDirecto === "string" ? codigoDirecto : codigo).trim();
    if (!code) return;
    setBuscando(true);
    setNotFound(false);
    setCliente(null);
    setRamaInfo(null);
    setLogoUrl("");
    const { data, error } = await supabase.rpc("obtener_portal_cliente", { p_id: code });
    setBuscando(false);
    if (error || !data) {
      setNotFound(true);
      return;
    }
    setCliente(data);
    setPestana("resumen");
    if (data.radicado) consultarRama(data.radicado);
    if (data.despacho?.tieneLogo) cargarLogo(code);
  };

  // El bucket de logos es privado: el servidor da una URL firmada y aquí se
  // baja como blob (la CSP no deja cargar imágenes de otro dominio directo).
  const cargarLogo = async (code) => {
    try {
      const r = await fetch(`/api/documentos/firmar?accion=logo-portal&codigo=${encodeURIComponent(code)}`);
      if (!r.ok) return;
      const { url } = await r.json();
      const blob = await (await fetch(url)).blob();
      setLogoUrl(URL.createObjectURL(blob));
    } catch (e) {
      // Sin logo se muestra el ícono de Nomos.
    }
  };

  const consultarRama = async (radicado) => {
    setConsultandoRama(true);
    setErrorRama("");
    try {
      setRamaInfo(await consultarRamaJudicial(radicado));
    } catch (e) {
      setErrorRama("La Rama Judicial no respondió en este momento. Intenta de nuevo en un rato.");
    }
    setConsultandoRama(false);
  };

  const salir = () => {
    setCliente(null);
    setCodigo("");
    setRamaInfo(null);
    setLogoUrl("");
  };

  const copiar = (texto, clave) => {
    navigator.clipboard?.writeText(texto).then(() => {
      setCopiado(clave);
      setTimeout(() => setCopiado(""), 1500);
    });
  };

  const descargarRecibo = async (pago) => {
    if (!pago.id) return;
    setDescargandoRecibo(pago.id);
    setErrorRecibo("");
    try {
      const resp = await fetch(`/api/documentos/firmar?accion=recibo-portal&codigo=${encodeURIComponent(codigo.trim())}&pagoId=${encodeURIComponent(pago.id)}`);
      const data = await resp.json();
      const href = data.url || data.dataUrl;
      if (href) {
        const a = document.createElement("a");
        a.href = href;
        a.target = "_blank";
        a.rel = "noreferrer";
        a.download = `recibo_${pago.fecha || ""}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        setErrorRecibo("No pudimos descargar el recibo. Intenta de nuevo o pídeselo a tu abogado.");
      }
    } catch (e) {
      setErrorRecibo("No pudimos descargar el recibo. Revisa tu conexión e intenta de nuevo.");
    }
    setDescargandoRecibo(null);
  };

  // ---------- Datos derivados ----------
  const pagos = [...(cliente?.pagos || [])].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  const totalPagado = pagos.reduce((sum, p) => sum + (Number(p.valor) || 0), 0);
  const valorTotal = Number(cliente?.valorTotal) || 0;
  const saldo = valorTotal > 0 ? Math.max(0, valorTotal - totalPagado) : null;
  const porcentajePagado = valorTotal > 0 ? Math.min(100, Math.round((totalPagado / valorTotal) * 100)) : 0;
  const despacho = cliente?.despacho || {};
  const whatsapp = numeroWhatsapp(despacho.celular);
  const wa = (texto) => (whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(texto)}` : null);
  const saludo = `Hola${cliente?.abogadoAsignado ? ` ${cliente.abogadoAsignado}` : ""}, soy ${cliente?.nombre || "tu cliente"}.`;
  const hoy = new Date().toISOString().slice(0, 10);

  let restante = totalPagado;
  const cuotas = [...(cliente?.cuotas || [])]
    .filter((c) => c && c.fecha)
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
    .map((c) => {
      const valor = Number(c.valor) || 0;
      const pagada = valor > 0 && restante >= valor;
      restante = Math.max(0, restante - valor);
      return { ...c, valor, pagada, vencida: !pagada && c.fecha < hoy };
    });
  let numeroCuota = 0;
  cuotas.forEach((c) => {
    if (!c.esAnticipo) c.numero = ++numeroCuota;
  });
  const siguienteCuota = cuotas.find((c) => !c.pagada);
  const proximoPago = siguienteCuota?.fecha || (saldo > 0 ? cliente?.proximoPago : null);
  const diasProximoPago = diasHasta(proximoPago);
  const cuotasVencidas = cuotas.filter((c) => c.vencida);

  const documentos = cliente?.documentos || [];
  const tieneContrato = documentos.some((d) => /contrato/i.test(d.titulo || ""));
  const docsPendientes = documentos.filter((d) => !d.firmado);
  const citas = cliente?.citas || [];
  const proximaCita = citas[0];
  const novedades = cliente?.actuaciones || [];
  const radicados = (cliente?.radicados?.length ? cliente.radicados : cliente?.radicado ? [cliente.radicado] : []).filter(Boolean);
  const etapa = cliente ? etapaActual(cliente, ramaInfo) : 0;
  const colorArea = COLOR_AREA_PROCESO[cliente?.areaProceso] || "#34D399";
  const ultimaRama = ramaInfo?.ultimaActuacion;

  // Lo que el cliente debería atender primero.
  const pendientes = [];
  if (docsPendientes.length) pendientes.push({ icono: "lapiz", color: "#B45309", texto: `Tienes ${docsPendientes.length} documento${docsPendientes.length > 1 ? "s" : ""} por firmar`, ir: "documentos" });
  if (cuotasVencidas.length) pendientes.push({ icono: "alerta", color: "#B42318", texto: `${cuotasVencidas.length} cuota${cuotasVencidas.length > 1 ? "s" : ""} vencida${cuotasVencidas.length > 1 ? "s" : ""}`, ir: "pagos" });
  else if (diasProximoPago !== null && diasProximoPago >= 0 && diasProximoPago <= 7) pendientes.push({ icono: "calendario", color: "#1D4ED8", texto: diasProximoPago === 0 ? "Tu próximo pago es hoy" : `Tu próximo pago es en ${diasProximoPago} día${diasProximoPago > 1 ? "s" : ""}`, ir: "pagos" });
  if (proximaCita && diasHasta(proximaCita.fecha) <= 3) pendientes.push({ icono: "video", color: "#7C3AED", texto: `Cita ${diasHasta(proximaCita.fecha) === 0 ? "hoy" : `el ${fechaCorta(proximaCita.fecha)}`}${proximaCita.hora ? ` a las ${proximaCita.hora}` : ""}`, ir: "resumen" });
  if (!tieneContrato) pendientes.push({ icono: "documento", color: "#64748B", texto: "Tu contrato aún no está cargado", ir: "documentos" });

  // ---------- Pantalla de ingreso ----------
  if (!cliente) {
    return (
      <div style={{ minHeight: "100vh", background: `radial-gradient(1200px 500px at 50% -10%, #145C4E 0%, ${VERDE_PROFUNDO} 45%, #06231E 100%)`, padding: "48px 20px 60px", boxSizing: "border-box" }}>
        <div style={{ maxWidth: 440, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ width: 64, height: 64, borderRadius: 18, margin: "0 auto 16px", background: "rgba(255,255,255,0.08)", border: `1px solid ${DORADO}66`, display: "flex", alignItems: "center", justifyContent: "center", color: DORADO, boxShadow: `0 0 0 6px rgba(201,162,75,0.08)` }}>
              <IconoNomos size={32} />
            </div>
            <p style={{ ...fuente, fontSize: 11, fontWeight: 700, letterSpacing: 3, color: DORADO, textTransform: "uppercase", margin: 0 }}>Portal privado</p>
            <h1 style={{ ...fuente, fontSize: 28, fontWeight: 800, color: "#FFFFFF", margin: "8px 0 8px", letterSpacing: -0.5 }}>Tu caso, siempre a la vista</h1>
            <p style={{ ...fuente, fontSize: 14, color: "rgba(255,255,255,0.7)", margin: 0, lineHeight: 1.55 }}>Consulta el avance de tu proceso, tus pagos, citas y documentos en un solo lugar.</p>
          </div>
          <div style={{ background: "rgba(255,255,255,0.97)", borderRadius: 22, padding: 24, boxShadow: "0 30px 60px -20px rgba(0,0,0,0.5)" }}>
            <Field label="Código de acceso">
              <input
                className="drx-input"
                style={{ ...inputStyle, fontWeight: 800, fontSize: 20, fontFamily: "monospace", textAlign: "center", letterSpacing: 4, padding: "15px 12px", textTransform: "uppercase", background: "#FFFFFF", color: "#0B0B0C" }}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="ABCD-2345"
                onKeyDown={(e) => e.key === "Enter" && buscar()}
                autoFocus
              />
            </Field>
            {notFound && (
              <p style={{ ...fuente, color: "#B42318", fontSize: 13, marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}>
                <Icono tipo="alerta" size={14} />
                No encontramos ese código. Verifícalo con tu abogado.
              </p>
            )}
            <button className="drx-btn-primary" style={{ ...buttonPrimary, marginTop: 16, width: "100%", padding: "14px", fontSize: 15, background: `linear-gradient(135deg, #145C4E, ${VERDE_PROFUNDO})` }} onClick={buscar} disabled={buscando}>
              {buscando ? "Verificando..." : "Entrar a mi portal"}
            </button>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 20 }}>
              {[
                ["balanza", "Estado judicial"],
                ["tarjeta", "Pagos y recibos"],
                ["lapiz", "Firma digital"],
              ].map(([ic, t]) => (
                <div key={t} style={{ textAlign: "center", padding: "10px 4px", borderRadius: 12, background: "#F4F7F6", color: "#2C5858" }}>
                  <Icono tipo={ic} size={17} />
                  <p style={{ ...fuente, fontSize: 11, fontWeight: 600, color: "#475467", margin: "5px 0 0" }}>{t}</p>
                </div>
              ))}
            </div>
          </div>
          <p style={{ ...fuente, fontSize: 11.5, color: "rgba(255,255,255,0.55)", margin: "18px 0 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Icono tipo="escudo" size={12} /> Conexión cifrada · Solo tú accedes con tu código
          </p>
        </div>
      </div>
    );
  }

  // ---------- Portal ----------
  return (
    <div style={{ minHeight: "100%", background: COLORS.bg, paddingBottom: 48 }}>
      {/* Encabezado */}
      <header style={{ background: `radial-gradient(900px 400px at 85% -20%, #1F7A66 0%, transparent 60%), linear-gradient(160deg, #0F4C41 0%, ${VERDE_PROFUNDO} 55%, #06231E 100%)`, padding: "22px 20px 86px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)", backgroundSize: "18px 18px", pointerEvents: "none" }} />
        <div style={{ maxWidth: 880, margin: "0 auto", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <div style={{ width: 40, height: 40, borderRadius: 11, background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", color: VERDE_PROFUNDO, overflow: "hidden", flexShrink: 0 }}>
                {logoUrl ? <img src={logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <IconoNomos size={22} />}
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ ...fuente, fontSize: 13.5, fontWeight: 700, color: "#FFFFFF", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{despacho.nombre || "Tu despacho"}</p>
                <p style={{ ...fuente, fontSize: 10.5, fontWeight: 700, letterSpacing: 1.6, color: DORADO, margin: 0, textTransform: "uppercase" }}>Portal del cliente</p>
              </div>
            </div>
            <button type="button" onClick={salir} style={{ ...fuente, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", color: "#FFFFFF", borderRadius: 10, padding: "7px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              Salir
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 26, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 260px", minWidth: 0 }}>
              <p style={{ ...fuente, fontSize: 13, color: "rgba(255,255,255,0.65)", margin: 0 }}>Bienvenido(a) de nuevo</p>
              <h1 style={{ ...fuente, fontSize: 27, fontWeight: 800, color: "#FFFFFF", margin: "4px 0 12px", letterSpacing: -0.5, lineHeight: 1.15 }}>{cliente.nombre}</h1>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {cliente.areaProceso && cliente.areaProceso !== "Otro" && (
                  <Chip color="#FFFFFF" fondo={`${colorArea}33`} borde={`${colorArea}88`}>
                    {cliente.areaProceso}
                  </Chip>
                )}
                {cliente.tipoProceso && cliente.tipoProceso !== "Otro" && (
                  <Chip color="#FFFFFF" fondo="rgba(255,255,255,0.1)" borde="rgba(255,255,255,0.2)">
                    {cliente.tipoProceso}
                  </Chip>
                )}
                <Chip color={cliente.procesoPausado ? "#FDE68A" : "#A7F3D0"} fondo="rgba(255,255,255,0.08)" borde="rgba(255,255,255,0.18)">
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: cliente.procesoPausado ? "#FBBF24" : "#34D399" }} />
                  {cliente.procesoPausado ? "En pausa" : "Caso activo"}
                </Chip>
              </div>
              {cliente.clienteDesde && <p style={{ ...fuente, fontSize: 12, color: "rgba(255,255,255,0.55)", margin: "12px 0 0" }}>Cliente desde {mesAnio(cliente.clienteDesde)} · Actualizado {haceCuanto(cliente.actualizadoEn)}</p>}
            </div>
            {valorTotal > 0 && (
              <Anillo porcentaje={porcentajePagado}>
                <span style={{ ...fuente, fontSize: 20, fontWeight: 800, color: "#FFFFFF" }}>{porcentajePagado}%</span>
                <span style={{ ...fuente, fontSize: 10, color: "rgba(255,255,255,0.65)" }}>pagado</span>
              </Anillo>
            )}
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 880, margin: "-62px auto 0", padding: "0 16px", position: "relative" }}>
        {/* Indicadores */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 14 }}>
          {[
            { icono: "balanza", color: "#2F80ED", etiqueta: "Etapa", valor: ETAPAS[etapa].titulo, ir: "proceso" },
            { icono: "calendario", color: "#7C3AED", etiqueta: "Próxima cita", valor: proximaCita ? `${fechaCorta(proximaCita.fecha)}${proximaCita.hora ? ` · ${proximaCita.hora}` : ""}` : "Sin agendar", ir: "resumen" },
            { icono: "tarjeta", color: "#10B981", etiqueta: saldo > 0 ? "Próximo pago" : "Pagos", valor: saldo > 0 ? (proximoPago ? fechaCorta(proximoPago) : formatoCOP(saldo)) : valorTotal > 0 ? "Al día" : `${pagos.length} registrados`, ir: "pagos" },
            { icono: "clip", color: "#F59E0B", etiqueta: "Documentos", valor: documentos.length ? `${documentos.length - docsPendientes.length}/${documentos.length} firmados` : "Ninguno aún", ir: "documentos" },
          ].map((k) => (
            <button
              key={k.etiqueta}
              type="button"
              onClick={() => setPestana(k.ir)}
              style={{ ...fuente, textAlign: "left", cursor: "pointer", background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 16, padding: "14px 14px", boxShadow: "0 10px 26px -14px rgba(11,59,51,0.35)", display: "flex", flexDirection: "column", gap: 8 }}
            >
              <span style={{ width: 28, height: 28, borderRadius: 9, background: `${k.color}1A`, color: k.color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icono tipo={k.icono} size={15} />
              </span>
              <span style={{ fontSize: 11, color: COLORS.muted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 }}>{k.etiqueta}</span>
              <span style={{ fontSize: 14.5, fontWeight: 800, color: COLORS.headingText, lineHeight: 1.2 }}>{k.valor}</span>
            </button>
          ))}
        </div>

        {/* Pestañas */}
        <nav style={{ position: "sticky", top: 0, zIndex: 5, background: COLORS.bg, padding: "8px 0", marginBottom: 6 }}>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${PESTANAS.length}, 1fr)`, gap: 4, padding: 4, background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 14 }}>
            {PESTANAS.map((p) => {
              const activa = pestana === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPestana(p.id)}
                  style={{ ...fuente, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, padding: "8px 0", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 10.5, fontWeight: 700, letterSpacing: -0.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", background: activa ? `linear-gradient(135deg, #145C4E, ${VERDE_PROFUNDO})` : "transparent", color: activa ? "#FFFFFF" : COLORS.inkSoft }}
                >
                  <Icono tipo={p.icono} size={16} />
                  <span style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" }}>{p.titulo}</span>
                </button>
              );
            })}
          </div>
        </nav>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* ===== RESUMEN ===== */}
          {pestana === "resumen" && (
            <>
              {pendientes.length > 0 && (
                <Tarjeta style={{ background: `linear-gradient(135deg, ${COLORS.panel}, ${COLORS.surfaceSoft})` }}>
                  <Encabezado icono="foco" color="#E11D48" titulo="Para tener en cuenta" subtitulo="Lo más importante de tu caso hoy" />
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {pendientes.map((p, i) => (
                      <button key={i} type="button" onClick={() => setPestana(p.ir)} style={{ ...fuente, display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", borderRadius: 12, border: `1px solid ${COLORS.border}`, background: COLORS.panel, cursor: "pointer", textAlign: "left", color: COLORS.ink, fontSize: 13.5, fontWeight: 600 }}>
                        <span style={{ color: p.color, display: "flex" }}>
                          <Icono tipo={p.icono} size={16} />
                        </span>
                        <span style={{ flex: 1 }}>{p.texto}</span>
                        <span style={{ color: COLORS.muted }}>›</span>
                      </button>
                    ))}
                  </div>
                </Tarjeta>
              )}

              <Tarjeta>
                <Encabezado icono="objetivo" color="#2F80ED" titulo="¿En qué va mi caso?" subtitulo="Etapa aproximada según las actuaciones registradas" />
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {ETAPAS.map((e, i) => {
                    const hecho = i < etapa;
                    const actual = i === etapa;
                    return (
                      <div key={e.titulo} style={{ display: "flex", gap: 12 }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                          <div style={{ width: 26, height: 26, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: hecho ? "#10B981" : actual ? "#2F80ED" : COLORS.surfaceSoft, color: hecho || actual ? "#FFFFFF" : COLORS.muted, border: hecho || actual ? "none" : `1px solid ${COLORS.border}`, boxShadow: actual ? "0 0 0 5px rgba(47,128,237,0.15)" : "none", ...fuente, fontSize: 12, fontWeight: 800 }}>
                            {hecho ? <Icono tipo="check" size={13} /> : i + 1}
                          </div>
                          {i < ETAPAS.length - 1 && <div style={{ width: 2, flex: 1, minHeight: 18, background: hecho ? "#10B981" : COLORS.border, margin: "3px 0" }} />}
                        </div>
                        <div style={{ paddingBottom: i < ETAPAS.length - 1 ? 14 : 0 }}>
                          <p style={{ ...fuente, fontSize: 14, fontWeight: 800, color: actual ? "#2F80ED" : hecho ? COLORS.headingText : COLORS.muted, margin: "3px 0 0" }}>
                            {e.titulo}
                            {actual && <span style={{ fontSize: 11, fontWeight: 700, marginLeft: 8, color: "#2F80ED", background: "rgba(47,128,237,0.1)", padding: "2px 8px", borderRadius: 20 }}>Aquí vamos</span>}
                          </p>
                          <p style={{ ...fuente, fontSize: 12.5, color: COLORS.muted, margin: "3px 0 0", lineHeight: 1.45 }}>{e.detalle}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Tarjeta>

              {(novedades[0] || ultimaRama) && (
                <Tarjeta>
                  <Encabezado icono="chispa" color="#6366F1" titulo="Lo último en tu caso" />
                  {novedades[0] && (
                    <div style={{ borderRadius: 14, padding: 14, background: "rgba(99,102,241,0.07)", borderLeft: "3px solid #6366F1", marginBottom: ultimaRama ? 10 : 0 }}>
                      <p style={{ ...fuente, fontSize: 11, fontWeight: 700, color: "#6366F1", margin: 0, textTransform: "uppercase", letterSpacing: 0.6 }}>Nota de tu abogado · {fechaLarga(novedades[0].fecha)}</p>
                      <p style={{ ...fuente, fontSize: 13.5, color: COLORS.ink, margin: "6px 0 0", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{novedades[0].nota}</p>
                    </div>
                  )}
                  {ultimaRama && (
                    <div style={{ borderRadius: 14, padding: 14, background: "rgba(47,128,237,0.07)", borderLeft: "3px solid #2F80ED" }}>
                      <p style={{ ...fuente, fontSize: 11, fontWeight: 700, color: "#2F80ED", margin: 0, textTransform: "uppercase", letterSpacing: 0.6 }}>Rama Judicial · {fechaLarga(ultimaRama.fecha)}</p>
                      <p style={{ ...fuente, fontSize: 13.5, fontWeight: 700, color: COLORS.ink, margin: "6px 0 0" }}>{ultimaRama.actuacion}</p>
                      {ultimaRama.anotacion && <p style={{ ...fuente, fontSize: 12.5, color: COLORS.inkSoft, margin: "4px 0 0", lineHeight: 1.5 }}>{ultimaRama.anotacion}</p>}
                    </div>
                  )}
                  <button type="button" onClick={() => setPestana("proceso")} style={{ ...fuente, marginTop: 12, background: "none", border: "none", color: "#2F80ED", fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0 }}>
                    Ver todo el historial ›
                  </button>
                </Tarjeta>
              )}

              {citas.length > 0 && (
                <Tarjeta>
                  <Encabezado icono="calendario" color="#7C3AED" titulo={citas.length > 1 ? "Próximas citas" : "Próxima cita"} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {citas.map((c, i) => {
                      const d = aFecha(c.fecha);
                      const faltan = diasHasta(c.fecha);
                      return (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: 12, borderRadius: 14, border: `1px solid ${COLORS.border}`, flexWrap: "wrap" }}>
                          <div style={{ width: 54, borderRadius: 12, overflow: "hidden", textAlign: "center", flexShrink: 0, border: `1px solid ${COLORS.border}` }}>
                            <div style={{ ...fuente, background: "#7C3AED", color: "#FFFFFF", fontSize: 10.5, fontWeight: 800, padding: "3px 0", textTransform: "uppercase" }}>{d?.toLocaleDateString("es-CO", { month: "short" })}</div>
                            <div style={{ ...fuente, fontSize: 21, fontWeight: 800, color: COLORS.headingText, padding: "4px 0" }}>{d?.getDate()}</div>
                          </div>
                          <div style={{ flex: "1 1 160px", minWidth: 0 }}>
                            <p style={{ ...fuente, fontSize: 14, fontWeight: 700, color: COLORS.headingText, margin: 0 }}>{c.titulo || "Cita con tu abogado"}</p>
                            <p style={{ ...fuente, fontSize: 12.5, color: COLORS.muted, margin: "3px 0 0" }}>
                              {d?.toLocaleDateString("es-CO", { weekday: "long" })}
                              {c.hora ? ` · ${c.hora}` : ""}
                              {faltan === 0 ? " · Hoy" : faltan === 1 ? " · Mañana" : faltan > 1 ? ` · En ${faltan} días` : ""}
                            </p>
                          </div>
                          {c.meet && (
                            <BotonAccion href={c.meet} icono="video" color="#1A73E8" style={{ padding: "9px 14px", fontSize: 12.5 }}>
                              Unirme por Meet
                            </BotonAccion>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Tarjeta>
              )}

              <Tarjeta style={{ background: `linear-gradient(150deg, #0F4C41, ${VERDE_PROFUNDO})`, border: "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                  <div style={{ width: 52, height: 52, borderRadius: "50%", background: `linear-gradient(135deg, ${DORADO}, #8C6D2C)`, color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", ...fuente, fontWeight: 800, fontSize: 18, flexShrink: 0 }}>
                    {(cliente.abogadoAsignado || despacho.nombre || "A")
                      .split(" ")
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((w) => w[0])
                      .join("")
                      .toUpperCase()}
                  </div>
                  <div style={{ flex: "1 1 180px", minWidth: 0 }}>
                    <p style={{ ...fuente, fontSize: 11, fontWeight: 700, color: DORADO, letterSpacing: 1.2, margin: 0, textTransform: "uppercase" }}>Tu abogado</p>
                    <p style={{ ...fuente, fontSize: 16, fontWeight: 800, color: "#FFFFFF", margin: "3px 0 0" }}>{cliente.abogadoAsignado || despacho.nombre || "Equipo del despacho"}</p>
                    {cliente.abogadoAsignado && despacho.nombre && <p style={{ ...fuente, fontSize: 12.5, color: "rgba(255,255,255,0.65)", margin: "2px 0 0" }}>{despacho.nombre}</p>}
                  </div>
                </div>
                {whatsapp && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginTop: 16 }}>
                    <BotonAccion href={wa(`${saludo} Quisiera saber cómo va mi proceso.`)} icono="chat">
                      Preguntar por mi caso
                    </BotonAccion>
                    <BotonAccion href={wa(`${saludo} Quisiera agendar una cita.`)} icono="calendario" color={DORADO}>
                      Agendar una cita
                    </BotonAccion>
                    <BotonAccion href={`tel:+${whatsapp}`} icono="telefono" color="rgba(255,255,255,0.14)" style={{ boxShadow: "none" }}>
                      Llamar
                    </BotonAccion>
                  </div>
                )}
              </Tarjeta>
            </>
          )}

          {/* ===== MI PROCESO ===== */}
          {pestana === "proceso" && (
            <>
              <Tarjeta>
                <Encabezado icono="edificio" color="#0F766E" titulo="Datos del proceso" />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                  {[
                    ["Área", cliente.areaProceso && cliente.areaProceso !== "Otro" ? cliente.areaProceso : null],
                    ["Tipo de proceso", cliente.tipoProceso && cliente.tipoProceso !== "Otro" ? cliente.tipoProceso : null],
                    ["Juzgado o entidad", cliente.juzgadoActual || ramaInfo?.proceso?.despacho],
                    ["Departamento", ramaInfo?.proceso?.departamento],
                    ["Partes", ramaInfo?.proceso?.sujetosProcesales],
                    ["Estado", cliente.procesoPausado ? "En pausa" : "Activo"],
                  ]
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <div key={k} style={{ padding: "11px 13px", borderRadius: 12, background: COLORS.surfaceSoft, border: `1px solid ${COLORS.border}` }}>
                        <p style={{ ...fuente, fontSize: 11, color: COLORS.muted, margin: 0, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{k}</p>
                        <p style={{ ...fuente, fontSize: 13.5, color: COLORS.ink, margin: "3px 0 0", fontWeight: 600, lineHeight: 1.4, wordBreak: "break-word" }}>{v}</p>
                      </div>
                    ))}
                </div>
                {radicados.length > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <p style={{ ...fuente, fontSize: 11, color: COLORS.muted, margin: "0 0 6px", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Radicado{radicados.length > 1 ? "s" : ""}</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {radicados.map((r) => (
                        <div key={r} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 12px", borderRadius: 10, border: `1px dashed ${COLORS.border}` }}>
                          <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: COLORS.ink, wordBreak: "break-all" }}>{r}</span>
                          <button type="button" onClick={() => copiar(r, r)} style={{ ...fuente, background: "none", border: "none", color: "#2F80ED", fontWeight: 700, fontSize: 12, cursor: "pointer", flexShrink: 0 }}>
                            {copiado === r ? "✓ Copiado" : "Copiar"}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Tarjeta>

              {cliente.radicado && (
                <Tarjeta>
                  <Encabezado
                    icono="balanza"
                    color="#2F80ED"
                    titulo="Actuaciones en la Rama Judicial"
                    subtitulo={ramaInfo?.consultadoEn ? `Consultado ${new Date(ramaInfo.consultadoEn).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" })}` : "Consulta en vivo"}
                    accion={
                      <button type="button" onClick={() => consultarRama(cliente.radicado)} disabled={consultandoRama} title="Actualizar" style={{ background: COLORS.surfaceSoft, border: `1px solid ${COLORS.border}`, borderRadius: 10, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: COLORS.inkSoft }}>
                        <Icono tipo="refrescar" size={15} />
                      </button>
                    }
                  />
                  {consultandoRama && <p style={{ ...fuente, fontSize: 13, color: COLORS.muted }}>Consultando la Rama Judicial…</p>}
                  {errorRama && <p style={{ ...fuente, fontSize: 13, color: "#B42318" }}>{errorRama}</p>}
                  {ramaInfo && !ramaInfo.encontrado && <p style={{ ...fuente, fontSize: 13, color: COLORS.muted }}>Este radicado todavía no aparece en la consulta pública de la Rama Judicial.</p>}
                  {ramaInfo?.encontrado && (
                    <div style={{ position: "relative", paddingLeft: 20 }}>
                      <div style={{ position: "absolute", left: 5, top: 6, bottom: 6, width: 2, background: COLORS.border }} />
                      {(ramaInfo.actuaciones || []).slice(0, verTodasRama ? 15 : 5).map((a, i) => (
                        <div key={i} style={{ position: "relative", paddingBottom: 14 }}>
                          <div style={{ position: "absolute", left: -20, top: 3, width: 12, height: 12, borderRadius: "50%", background: i === 0 ? "#2F80ED" : COLORS.panel, border: "2px solid #2F80ED" }} />
                          <p style={{ ...fuente, fontSize: 11.5, color: COLORS.muted, margin: 0 }}>{fechaLarga(a.fecha)}</p>
                          <p style={{ ...fuente, fontSize: 13.5, fontWeight: 700, color: COLORS.ink, margin: "2px 0 0" }}>{a.actuacion}</p>
                          {a.anotacion && <p style={{ ...fuente, fontSize: 12.5, color: COLORS.inkSoft, margin: "3px 0 0", lineHeight: 1.5 }}>{a.anotacion}</p>}
                        </div>
                      ))}
                      {(ramaInfo.actuaciones || []).length > 5 && (
                        <button type="button" onClick={() => setVerTodasRama(!verTodasRama)} style={{ ...fuente, background: "none", border: "none", color: "#2F80ED", fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0 }}>
                          {verTodasRama ? "Ver menos" : `Ver las ${ramaInfo.actuaciones.length} actuaciones`}
                        </button>
                      )}
                    </div>
                  )}
                  <p style={{ ...fuente, fontSize: 11.5, color: COLORS.muted, margin: "10px 0 0", lineHeight: 1.45 }}>¿No entiendes algún término? Revisa el glosario en la pestaña Ayuda.</p>
                </Tarjeta>
              )}

              <Tarjeta>
                <Encabezado icono="chat" color="#6366F1" titulo="Novedades de tu abogado" subtitulo="Explicadas en palabras sencillas" />
                {novedades.length === 0 ? (
                  <p style={{ ...fuente, fontSize: 13, color: COLORS.muted, margin: 0 }}>Aún no hay novedades escritas. Cuando haya un avance, tu abogado lo contará aquí.</p>
                ) : (
                  <div style={{ position: "relative", paddingLeft: 20 }}>
                    <div style={{ position: "absolute", left: 5, top: 6, bottom: 6, width: 2, background: COLORS.border }} />
                    {novedades.map((a, i) => (
                      <div key={i} style={{ position: "relative", paddingBottom: i < novedades.length - 1 ? 16 : 0 }}>
                        <div style={{ position: "absolute", left: -20, top: 3, width: 12, height: 12, borderRadius: "50%", background: i === 0 ? "#6366F1" : COLORS.panel, border: "2px solid #6366F1" }} />
                        <p style={{ ...fuente, fontSize: 11.5, color: COLORS.muted, margin: 0 }}>
                          {fechaLarga(a.fecha)} · {haceCuanto(a.fecha)}
                        </p>
                        <p style={{ ...fuente, fontSize: 13.5, color: COLORS.ink, margin: "3px 0 0", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{a.nota}</p>
                      </div>
                    ))}
                  </div>
                )}
              </Tarjeta>
            </>
          )}

          {/* ===== PAGOS ===== */}
          {pestana === "pagos" && (
            <>
              {valorTotal > 0 && (
                <Tarjeta>
                  <Encabezado icono="tarjeta" color="#10B981" titulo="Estado de cuenta" />
                  <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
                    <Anillo porcentaje={porcentajePagado} size={110} grosor={11} color={saldo <= 0 ? "#10B981" : "#2F80ED"} fondo={COLORS.surfaceSoft}>
                      <span style={{ ...fuente, fontSize: 22, fontWeight: 800, color: COLORS.headingText }}>{porcentajePagado}%</span>
                      <span style={{ ...fuente, fontSize: 10.5, color: COLORS.muted }}>pagado</span>
                    </Anillo>
                    <div style={{ flex: "1 1 200px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      {[
                        ["Total acordado", formatoCOP(valorTotal), COLORS.headingText],
                        ["Pagado", formatoCOP(totalPagado), "#10B981"],
                        ["Saldo", saldo <= 0 ? "Al día ✓" : formatoCOP(saldo), saldo <= 0 ? "#10B981" : "#B45309"],
                        ["Pagos hechos", String(pagos.length), COLORS.headingText],
                      ].map(([k, v, c]) => (
                        <div key={k}>
                          <p style={{ ...fuente, fontSize: 11, color: COLORS.muted, margin: 0, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{k}</p>
                          <p style={{ ...fuente, fontSize: 16, fontWeight: 800, color: c, margin: "3px 0 0" }}>{v}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  {proximoPago && saldo > 0 && (
                    <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: 12, display: "flex", alignItems: "center", gap: 10, background: diasProximoPago < 0 ? "#FEF2F2" : "#EFF6FF", color: diasProximoPago < 0 ? "#B42318" : "#1D4ED8" }}>
                      <Icono tipo={diasProximoPago < 0 ? "alerta" : "calendario"} size={16} />
                      <span style={{ ...fuente, fontSize: 13.5, fontWeight: 700 }}>
                        {diasProximoPago < 0 ? `Pago vencido desde el ${fechaLarga(proximoPago)}` : `Próximo pago: ${fechaLarga(proximoPago)}`}
                        {siguienteCuota?.valor ? ` · ${formatoCOP(siguienteCuota.valor)}` : ""}
                      </span>
                    </div>
                  )}
                  {whatsapp && saldo > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <BotonAccion href={wa(`${saludo} Acabo de hacer un pago y te envío el comprobante.`)} icono="chat" variante="borde">
                        Reportar un pago a mi abogado
                      </BotonAccion>
                    </div>
                  )}
                </Tarjeta>
              )}

              {cuotas.length > 0 && (
                <Tarjeta>
                  <Encabezado icono="calendario" color="#2F80ED" titulo="Plan de pagos" subtitulo={`${cuotas.filter((c) => c.pagada).length} de ${cuotas.length} cuotas pagadas`} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {cuotas.map((c, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 12px", borderRadius: 12, border: `1px solid ${c === siguienteCuota ? "#2F80ED" : COLORS.border}`, background: c === siguienteCuota ? "rgba(47,128,237,0.05)" : "transparent" }}>
                        <div style={{ width: 30, height: 30, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: c.pagada ? "#10B981" : c.vencida ? "#FEE2E2" : COLORS.surfaceSoft, color: c.pagada ? "#FFFFFF" : c.vencida ? "#B42318" : COLORS.muted, ...fuente, fontSize: 12, fontWeight: 800 }}>
                          {c.pagada ? <Icono tipo="check" size={14} /> : c.esAnticipo ? "A" : c.numero}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ ...fuente, fontSize: 13.5, fontWeight: 700, color: COLORS.ink, margin: 0 }}>{c.esAnticipo ? "Anticipo" : `Cuota ${c.numero}`}</p>
                          <p style={{ ...fuente, fontSize: 12, color: COLORS.muted, margin: "2px 0 0" }}>{fechaLarga(c.fecha)}</p>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <p style={{ ...fuente, fontSize: 13.5, fontWeight: 800, color: COLORS.ink, margin: 0 }}>{formatoCOP(c.valor)}</p>
                          <p style={{ ...fuente, fontSize: 11, fontWeight: 700, margin: "2px 0 0", color: c.pagada ? "#10B981" : c.vencida ? "#B42318" : "#1D4ED8" }}>{c.pagada ? "Pagada" : c.vencida ? "Vencida" : c === siguienteCuota ? "Siguiente" : "Pendiente"}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Tarjeta>
              )}

              <Tarjeta>
                <Encabezado icono="documento" color="#8B5CF6" titulo="Historial de pagos" subtitulo={pagos.length ? "Descarga el recibo de cada pago" : null} />
                {pagos.length === 0 ? (
                  <p style={{ ...fuente, fontSize: 13, color: COLORS.muted, margin: 0 }}>Todavía no hay pagos registrados.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {pagos.map((p, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: i < pagos.length - 1 ? `1px solid ${COLORS.border}` : "none" }}>
                        <div style={{ width: 36, height: 36, borderRadius: 11, background: "rgba(16,185,129,0.1)", color: "#10B981", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <Icono tipo="check" size={16} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ ...fuente, fontSize: 13.5, fontWeight: 700, color: COLORS.ink, margin: 0 }}>{p.concepto || "Pago"}</p>
                          <p style={{ ...fuente, fontSize: 12, color: COLORS.muted, margin: "2px 0 0" }}>{fechaLarga(p.fecha)}</p>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                        <span style={{ ...fuente, fontSize: 14, fontWeight: 800, color: "#10B981" }}>{formatoCOP(p.valor)}</span>
                        {p.tieneRecibo ? (
                          <button type="button" onClick={() => descargarRecibo(p)} disabled={descargandoRecibo === p.id} style={{ ...fuente, display: "inline-flex", alignItems: "center", gap: 5, background: COLORS.surfaceSoft, border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: "6px 10px", fontSize: 12, fontWeight: 700, color: COLORS.ink, cursor: "pointer", flexShrink: 0 }}>
                            <Icono tipo="cursorArriba" size={12} style={{ transform: "rotate(180deg)" }} />
                            {descargandoRecibo === p.id ? "…" : "Recibo"}
                          </button>
                        ) : (
                          whatsapp && (
                            <a href={wa(`${saludo} ¿Me pueden enviar el recibo de mi pago del ${fechaLarga(p.fecha)} por ${formatoCOP(p.valor)}?`)} target="_blank" rel="noreferrer" style={{ ...fuente, fontSize: 11.5, fontWeight: 700, color: COLORS.muted, textDecoration: "none", flexShrink: 0 }}>
                              Pedir recibo
                            </a>
                          )
                        )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {errorRecibo && <p style={{ ...fuente, margin: "10px 0 0", color: "#B42318", fontSize: 12 }}>{errorRecibo}</p>}
              </Tarjeta>
            </>
          )}

          {/* ===== DOCUMENTOS ===== */}
          {pestana === "documentos" && (
            <Tarjeta>
              <Encabezado icono="clip" color="#F59E0B" titulo="Mis documentos" subtitulo={documentos.length ? `${documentos.length - docsPendientes.length} de ${documentos.length} firmados` : null} />
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {!tieneContrato && (
                  <div style={{ border: `1.5px dashed ${COLORS.border}`, borderRadius: 14, padding: 16, display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div style={{ width: 44, height: 54, borderRadius: 8, border: `1.5px dashed ${COLORS.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.muted, flexShrink: 0 }}>
                      <Icono tipo="documento" size={20} />
                    </div>
                    <div style={{ flex: "1 1 200px" }}>
                      <p style={{ ...fuente, fontSize: 14, fontWeight: 700, color: COLORS.ink, margin: 0 }}>Contrato de prestación de servicios</p>
                      <p style={{ ...fuente, fontSize: 12.5, color: COLORS.muted, margin: "4px 0 10px", lineHeight: 1.45 }}>Todavía no está cargado. Puedes pedírselo a tu abogado y aparecerá aquí para consultarlo o firmarlo.</p>
                      {whatsapp && (
                        <BotonAccion href={wa(`${saludo} ¿Me pueden cargar mi contrato de prestación de servicios en el portal?`)} icono="chat" style={{ padding: "9px 14px", fontSize: 12.5 }}>
                          Pedírselo a mi abogado
                        </BotonAccion>
                      )}
                    </div>
                  </div>
                )}
                {documentos.map((d, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, borderRadius: 14, border: `1px solid ${d.firmado ? COLORS.border : "#F5C77E"}`, background: d.firmado ? "transparent" : "rgba(245,158,11,0.05)", flexWrap: "wrap" }}>
                    <div style={{ width: 40, height: 48, borderRadius: 8, background: d.firmado ? "rgba(16,185,129,0.1)" : "rgba(245,158,11,0.12)", color: d.firmado ? "#10B981" : "#B45309", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Icono tipo="documento" size={18} />
                    </div>
                    <div style={{ flex: "1 1 160px", minWidth: 0 }}>
                      <p style={{ ...fuente, fontSize: 13.5, fontWeight: 700, color: COLORS.ink, margin: 0, wordBreak: "break-word" }}>{d.titulo}</p>
                      <p style={{ ...fuente, fontSize: 12, margin: "3px 0 0", color: d.firmado ? "#10B981" : "#B45309", fontWeight: 600 }}>
                        {d.firmado ? "✓ Firmado" : "Pendiente de tu firma"}
                        {d.fecha ? <span style={{ color: COLORS.muted, fontWeight: 400 }}> · {fechaLarga(d.fecha)}</span> : null}
                      </p>
                    </div>
                    {d.id && (
                      <BotonAccion href={`/?codigo=${encodeURIComponent(d.id)}#firmar`} icono={d.firmado ? "ojo" : "lapiz"} color={d.firmado ? "#475467" : "#B45309"} variante={d.firmado ? "borde" : "lleno"} style={{ padding: "8px 14px", fontSize: 12.5 }}>
                        {d.firmado ? "Ver" : "Firmar ahora"}
                      </BotonAccion>
                    )}
                  </div>
                ))}
                {whatsapp && (
                  <BotonAccion href={wa(`${saludo} Necesito una copia de un documento de mi proceso.`)} icono="sobre" variante="borde">
                    Solicitar otro documento
                  </BotonAccion>
                )}
              </div>
              <p style={{ ...fuente, fontSize: 11.5, color: COLORS.muted, margin: "14px 0 0", display: "flex", alignItems: "center", gap: 6 }}>
                <Icono tipo="escudo" size={12} /> Firma electrónica válida según la Ley 527 de 1999.
              </p>
            </Tarjeta>
          )}

          {/* ===== AYUDA ===== */}
          {pestana === "ayuda" && (
            <>
              <Tarjeta>
                <Encabezado icono="ayuda" color="#0EA5E9" titulo="Preguntas frecuentes" />
                {PREGUNTAS.map(([p, r]) => (
                  <Desplegable key={p} titulo={p}>
                    {r}
                  </Desplegable>
                ))}
              </Tarjeta>
              <Tarjeta>
                <Encabezado icono="balanza" color="#2F80ED" titulo="Glosario judicial" subtitulo="Lo que significan los términos que verás en tu proceso" />
                {GLOSARIO.map(([t, d]) => (
                  <Desplegable key={t} titulo={t}>
                    {d}
                  </Desplegable>
                ))}
              </Tarjeta>
              {whatsapp && (
                <Tarjeta>
                  <Encabezado icono="chat" color="#1DA851" titulo="¿Necesitas algo más?" subtitulo="Escríbele directamente a tu abogado" />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
                    <BotonAccion href={wa(`${saludo} Quisiera recibir información sobre mi proceso.`)} icono="chat">
                      Solicitar información
                    </BotonAccion>
                    <BotonAccion href={wa(`${saludo} Necesito actualizar mis datos de contacto.`)} icono="persona" variante="borde">
                      Actualizar mis datos
                    </BotonAccion>
                  </div>
                </Tarjeta>
              )}
            </>
          )}
        </div>

        <p style={{ ...fuente, fontSize: 11.5, color: COLORS.muted, textAlign: "center", margin: "28px 0 0", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <Icono tipo="escudo" size={12} /> Información confidencial · Protegida por la Ley 1581 de 2012 · Con tecnología Nomos
        </p>
      </div>
    </div>
  );
}
