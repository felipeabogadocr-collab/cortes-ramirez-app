import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import { storageGet, storageSet, getNombreDespacho } from "../lib/storage";
import {
  COLORS, uid, useIndex, useUsuariosDespacho, Field, inputStyle, buttonPrimary, buttonGhost,
  Card, EncabezadoSeccion, Icono, fechaHoyISO,
} from "../App.jsx";

const PLATAFORMAS_CONTENIDO = ["Instagram", "Facebook", "TikTok"];
const ESTADOS_CONTENIDO = ["Idea", "En preparación", "Listo para subir", "Publicado"];
const COLOR_ESTADO_CONTENIDO = {
  Idea: "#8B5CF6",
  "En preparación": "#F5A524",
  "Listo para subir": "#2F80ED",
  Publicado: "#10B981",
};
const FORM_CONTENIDO_INICIAL = { titulo: "", plataformas: ["Instagram"], fecha: "", hora: "", estado: "Idea", asignadoA: "", notas: "" };

function fechaISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function construirMatrizMes(anio, mes) {
  const primerDia = new Date(anio, mes, 1);
  const inicioSemana = primerDia.getDay();
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();
  const celdas = [];
  for (let i = 0; i < inicioSemana; i++) celdas.push(null);
  for (let d = 1; d <= diasEnMes; d++) celdas.push(new Date(anio, mes, d));
  while (celdas.length % 7 !== 0) celdas.push(null);
  const semanas = [];
  for (let i = 0; i < celdas.length; i += 7) semanas.push(celdas.slice(i, i + 7));
  return semanas;
}

function contextoEstrategia(estrategia) {
  if (!estrategia) return "";
  const partes = [];
  if (estrategia.audiencia?.trim()) partes.push(`Audiencia/nicho objetivo a atraer como seguidores y futuros clientes: ${estrategia.audiencia.trim()}.`);
  if (estrategia.pilares?.trim()) partes.push(`Pilares de contenido definidos por el despacho: ${estrategia.pilares.trim()}.`);
  if (estrategia.tono?.trim()) partes.push(`Tono de voz que debe usarse: ${estrategia.tono.trim()}.`);
  return partes.join(" ");
}

async function generarIdeasCalendario(tema, estrategia) {
  const contexto = contextoEstrategia(estrategia);
  const { data: sesionData } = await supabase.auth.getSession();
  const token = sesionData?.session?.access_token;
  const response = await fetch("/api/assistant", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      system:
        `Eres un community manager experto y estratega de contenido para ${getNombreDespacho()}, un despacho de abogados en Colombia que publica en Instagram, Facebook y TikTok. ` +
        `Genera 5 ideas de contenido concretas, poderosas y variadas (educativas, cercanas, casos de éxito sin romper confidencialidad, detrás de cámaras, tendencias, formatos de video corto, etc.), pensadas para atraer seguidores del nicho correcto y convertirlos en clientes potenciales.` +
        (tema ? ` Enfocadas en: ${tema}.` : ".") +
        (contexto ? ` ${contexto}` : "") +
        ` Responde SOLO con una lista numerada del 1 al 5, cada idea en una sola línea corta (máximo 25 palabras) incluyendo el formato (reel, carrusel, historia, etc.), sin texto adicional antes o después, sin usar markdown.`,
      messages: [{ role: "user", content: "Dame ideas de contenido." }],
    }),
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || "No se pudo contactar al asistente de IA");
  const texto = (data.content || []).map((b) => b.text || "").join("");
  return texto
    .split("\n")
    .map((l) => l.replace(/^\s*\d+[.)]\s*/, "").trim())
    .filter(Boolean);
}

function useContenido() {
  const { ids, addId, removeId } = useIndex("indice-contenido", true);
  const [items, setItems] = useState({});

  const cargar = useCallback(async () => {
    const entries = {};
    for (const id of ids) {
      const raw = await storageGet(`contenido:${id}`, true);
      if (raw) entries[id] = JSON.parse(raw);
    }
    setItems(entries);
  }, [ids]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const crear = async (datos) => {
    const id = uid();
    const nuevo = { ...datos, id, creadoEn: new Date().toISOString() };
    await storageSet(`contenido:${id}`, JSON.stringify(nuevo), true);
    await addId(id);
    setItems((prev) => ({ ...prev, [id]: nuevo }));
    return nuevo;
  };

  const actualizar = async (id, cambios) => {
    const actualizado = { ...items[id], ...cambios };
    await storageSet(`contenido:${id}`, JSON.stringify(actualizado), true);
    setItems((prev) => ({ ...prev, [id]: actualizado }));
  };

  const eliminar = async (id) => {
    await removeId(id);
    setItems((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  return { items, crear, actualizar, eliminar };
}

function useIdeasContenido() {
  const [ideas, setIdeas] = useState([]);

  const cargar = useCallback(async () => {
    const raw = await storageGet("ideas-contenido", true);
    setIdeas(raw ? JSON.parse(raw) : []);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const agregarVarias = async (textos) => {
    const nuevas = textos.map((t) => ({ id: uid(), texto: t, creadaEn: new Date().toISOString() }));
    const actualizadas = [...nuevas, ...ideas];
    await storageSet("ideas-contenido", JSON.stringify(actualizadas), true);
    setIdeas(actualizadas);
  };

  const eliminar = async (id) => {
    const actualizadas = ideas.filter((i) => i.id !== id);
    await storageSet("ideas-contenido", JSON.stringify(actualizadas), true);
    setIdeas(actualizadas);
  };

  return { ideas, agregarVarias, eliminar };
}

const ESTRATEGIA_INICIAL = { audiencia: "", pilares: "", tono: "" };

function useEstrategiaContenido() {
  const [estrategia, setEstrategiaState] = useState(ESTRATEGIA_INICIAL);
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    (async () => {
      const raw = await storageGet("estrategia-contenido", true);
      if (raw) {
        try {
          setEstrategiaState(JSON.parse(raw));
        } catch (e) {
          setEstrategiaState(ESTRATEGIA_INICIAL);
        }
      }
      setCargado(true);
    })();
  }, []);

  const guardar = async (nueva) => {
    setEstrategiaState(nueva);
    await storageSet("estrategia-contenido", JSON.stringify(nueva), true);
  };

  return { estrategia, cargado, guardar };
}

function EstrategiaContenidoCard({ estrategia, cargado, onGuardar }) {
  const [form, setForm] = useState(ESTRATEGIA_INICIAL);
  const [editando, setEditando] = useState(false);

  useEffect(() => {
    if (cargado) setForm(estrategia);
  }, [cargado, estrategia]);

  const guardarCambios = async () => {
    await onGuardar(form);
    setEditando(false);
  };

  if (!cargado) return null;

  const tieneEstrategia = estrategia.audiencia || estrategia.pilares || estrategia.tono;

  return (
    <Card style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 700, color: COLORS.ink, margin: 0, display: "flex", alignItems: "center", gap: 6 }}><Icono tipo="objetivo" size={15} /> Estrategia y nicho</p>
        <button className="drx-btn-ghost" style={{ ...buttonGhost, fontSize: 11.5, padding: "5px 10px" }} onClick={() => setEditando((e) => !e)}>
          {editando ? "Cancelar" : tieneEstrategia ? "Editar" : "Definir"}
        </button>
      </div>
      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted, marginBottom: 12 }}>
        Define a quién le quieres hablar y de qué temas. El Community Manager IA y el banco de ideas usan esto para darte ideas y estrategia enfocadas en
        convertir a ese nicho en seguidores y clientes.
      </p>
      {editando ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Audiencia / nicho objetivo">
            <textarea
              className="drx-input"
              style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
              value={form.audiencia}
              onChange={(e) => setForm((f) => ({ ...f, audiencia: e.target.value }))}
              placeholder="Ej: personas de 25-45 años en Colombia con dudas de arriendo, herencias, despidos"
            />
          </Field>
          <Field label="Pilares de contenido">
            <textarea
              className="drx-input"
              style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
              value={form.pilares}
              onChange={(e) => setForm((f) => ({ ...f, pilares: e.target.value }))}
              placeholder="Ej: tips legales rápidos, mitos vs realidad, casos de éxito, detrás de cámaras del despacho"
            />
          </Field>
          <Field label="Tono de voz">
            <input
              className="drx-input"
              style={inputStyle}
              value={form.tono}
              onChange={(e) => setForm((f) => ({ ...f, tono: e.target.value }))}
              placeholder="Ej: cercano, claro, con humor moderado, nada acartonado"
            />
          </Field>
          <button className="drx-btn-primary" style={buttonPrimary} onClick={guardarCambios}>
            Guardar estrategia
          </button>
        </div>
      ) : tieneEstrategia ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {estrategia.audiencia && (
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.inkSoft, margin: 0 }}>
              <strong>Audiencia:</strong> {estrategia.audiencia}
            </p>
          )}
          {estrategia.pilares && (
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.inkSoft, margin: 0 }}>
              <strong>Pilares:</strong> {estrategia.pilares}
            </p>
          )}
          {estrategia.tono && (
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.inkSoft, margin: 0 }}>
              <strong>Tono:</strong> {estrategia.tono}
            </p>
          )}
        </div>
      ) : (
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted }}>Aún no la has definido.</p>
      )}
    </Card>
  );
}

function CommunityManagerIA({ estrategia, onGuardarIdeas }) {
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(false);
  const [historialCargado, setHistorialCargado] = useState(false);
  const contenedorRef = useRef(null);

  useEffect(() => {
    (async () => {
      const raw = await storageGet("chat-community-manager", true);
      if (raw) {
        try {
          setMensajes(JSON.parse(raw));
        } catch (e) {
          setMensajes([]);
        }
      }
      setHistorialCargado(true);
    })();
  }, []);

  useEffect(() => {
    if (!historialCargado) return;
    storageSet("chat-community-manager", JSON.stringify(mensajes), true);
  }, [mensajes, historialCargado]);

  useEffect(() => {
    if (contenedorRef.current) contenedorRef.current.scrollTop = contenedorRef.current.scrollHeight;
  }, [mensajes, cargando]);

  const enviar = async () => {
    if (!texto.trim() || cargando) return;
    const nuevos = [...mensajes, { rol: "usuario", texto: texto.trim() }];
    setMensajes(nuevos);
    setTexto("");
    setCargando(true);
    try {
      const contexto = contextoEstrategia(estrategia);
      const systemPrompt =
        `Eres un community manager experto y estratega de contenido para ${getNombreDespacho()}, un despacho de abogados en Colombia con cuentas en Instagram, Facebook y TikTok. ` +
        `Ayudas a la persona encargada de contenido (que no es abogada) a crear un plan de contenido poderoso: ideas concretas de video o post con gancho (hook), guion corto, caption sugerido y hashtags relevantes; estrategia de crecimiento para convertir seguidores en un nicho fiel de clientes potenciales; y consejos de formato y tendencias específicos de Instagram, Facebook y TikTok. Sé específico y práctico, nunca genérico. ` +
        (contexto ? `${contexto} ` : "") +
        `Responde siempre en español, en un tono cercano y motivador, con listas y pasos claros cuando aplique.`;
      const mensajesAPI = nuevos.map((m) => ({ role: m.rol === "usuario" ? "user" : "assistant", content: m.texto }));
      const { data: sesionData } = await supabase.auth.getSession();
      const token = sesionData?.session?.access_token;
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 900, system: systemPrompt, messages: mensajesAPI }),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || "No se pudo contactar al asistente de IA");
      const respuesta =
        (data.content || [])
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("\n") || "No pude generar una respuesta, intenta de nuevo.";
      setMensajes((prev) => [...prev, { rol: "asistente", texto: respuesta }]);
    } catch (e) {
      setMensajes((prev) => [...prev, { rol: "asistente", texto: `Tuve un problema para responder: ${e.message || "intenta de nuevo en un momento."}` }]);
    }
    setCargando(false);
  };

  const guardarComoIdeas = (textoRespuesta) => {
    const lineas = textoRespuesta
      .split("\n")
      .map((l) => l.replace(/^\s*[\d.\-•)]+\s*/, "").trim())
      .filter((l) => l.length > 3);
    if (lineas.length > 0) onGuardarIdeas(lineas);
  };

  const borrarHistorial = async () => {
    setMensajes([]);
    await storageSet("chat-community-manager", JSON.stringify([]), true);
  };

  return (
    <Card style={{ marginBottom: 20, padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 700, color: COLORS.ink, margin: 0, display: "flex", alignItems: "center", gap: 6 }}><Icono tipo="apreton" size={15} /> Community Manager IA</p>
        {mensajes.length > 0 && (
          <button
            onClick={borrarHistorial}
            style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.muted, fontSize: 11.5, fontFamily: "Inter, sans-serif", textDecoration: "underline" }}
          >
            Borrar conversación
          </button>
        )}
      </div>
      <div ref={contenedorRef} style={{ minHeight: 200, maxHeight: 420, overflowY: "auto", overscrollBehavior: "contain", display: "flex", flexDirection: "column", gap: 10, marginBottom: 12, paddingRight: 4 }}>
        {mensajes.length === 0 && (
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted }}>
            Pídele ideas de video, guiones, captions, hashtags o estrategia para crecer seguidores que se conviertan en clientes. Ejemplo: "dame 5 ideas de
            reels sobre herencias" o "ayúdame a planear el contenido de esta semana".
          </p>
        )}
        {mensajes.map((m, i) => (
          <div key={i} style={{ alignSelf: m.rol === "usuario" ? "flex-end" : "flex-start", maxWidth: "88%" }}>
            <div
              style={{
                background: m.rol === "usuario" ? COLORS.navy : COLORS.accentSoft,
                color: m.rol === "usuario" ? "#FFFFFF" : COLORS.navy,
                borderRadius: 10,
                padding: "9px 13px",
                fontSize: 13,
                fontFamily: "Inter, sans-serif",
                whiteSpace: "pre-wrap",
                lineHeight: 1.5,
              }}
            >
              {m.texto}
            </div>
            {m.rol === "asistente" && (
              <button className="drx-btn-ghost" style={{ ...buttonGhost, fontSize: 11, padding: "4px 9px", marginTop: 4 }} onClick={() => guardarComoIdeas(m.texto)}>
                + Guardar como ideas
              </button>
            )}
          </div>
        ))}
        {cargando && <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted }}>Pensando...</p>}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="drx-input"
          style={{ ...inputStyle, flex: 1 }}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Ej: dame ideas de reels sobre herencias para esta semana"
          onKeyDown={(e) => e.key === "Enter" && enviar()}
        />
        <button className="drx-btn-primary" style={buttonPrimary} onClick={enviar} disabled={cargando || !texto.trim()}>
          Enviar
        </button>
      </div>
    </Card>
  );
}

export default function ContenidoTab() {
  const { items, crear, actualizar, eliminar } = useContenido();
  const { usuarios } = useUsuariosDespacho();
  const { ideas, agregarVarias, eliminar: eliminarIdea } = useIdeasContenido();
  const { estrategia, cargado: estrategiaCargada, guardar: guardarEstrategia } = useEstrategiaContenido();

  const [mesActual, setMesActual] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [diaSeleccionado, setDiaSeleccionado] = useState(fechaHoyISO());
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState(FORM_CONTENIDO_INICIAL);
  const [editandoId, setEditandoId] = useState(null);
  const [temaIdeas, setTemaIdeas] = useState("");
  const [generandoIdeas, setGenerandoIdeas] = useState(false);
  const [ideaCopiada, setIdeaCopiada] = useState("");

  const lista = Object.values(items);
  const porFecha = {};
  lista.forEach((it) => {
    porFecha[it.fecha] = porFecha[it.fecha] || [];
    porFecha[it.fecha].push(it);
  });

  const semanas = construirMatrizMes(mesActual.getFullYear(), mesActual.getMonth());
  const hoyISO = fechaHoyISO();

  const abrirNuevo = (fechaPrefill) => {
    setEditandoId(null);
    setForm({ ...FORM_CONTENIDO_INICIAL, fecha: fechaPrefill || diaSeleccionado });
    setMostrarForm(true);
  };

  const abrirEdicion = (item) => {
    setEditandoId(item.id);
    setForm({
      titulo: item.titulo,
      plataformas: item.plataformas || [],
      fecha: item.fecha,
      hora: item.hora || "",
      estado: item.estado,
      asignadoA: item.asignadoA || "",
      notas: item.notas || "",
    });
    setMostrarForm(true);
  };

  const guardar = async () => {
    if (!form.titulo.trim() || !form.fecha) return;
    if (editandoId) {
      await actualizar(editandoId, form);
    } else {
      await crear(form);
    }
    setMostrarForm(false);
    setForm(FORM_CONTENIDO_INICIAL);
    setEditandoId(null);
  };

  const alternarPlataforma = (p) => {
    setForm((f) => ({ ...f, plataformas: f.plataformas.includes(p) ? f.plataformas.filter((x) => x !== p) : [...f.plataformas, p] }));
  };

  const pedirIdeas = async () => {
    setGenerandoIdeas(true);
    try {
      const nuevas = await generarIdeasCalendario(temaIdeas.trim(), estrategia);
      if (nuevas.length > 0) await agregarVarias(nuevas);
    } catch (e) {
      // se puede reintentar con el mismo botón
    }
    setGenerandoIdeas(false);
  };

  const usarIdea = (idea) => {
    setEditandoId(null);
    setForm({ ...FORM_CONTENIDO_INICIAL, titulo: idea.texto, fecha: diaSeleccionado });
    setMostrarForm(true);
  };

  const itemsDelDia = (porFecha[diaSeleccionado] || []).sort((a, b) => (a.hora || "").localeCompare(b.hora || ""));

  const pendientesMes = lista.filter((it) => {
    const f = new Date(`${it.fecha}T12:00:00`);
    return it.estado !== "Publicado" && f.getFullYear() === mesActual.getFullYear() && f.getMonth() === mesActual.getMonth();
  }).length;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <EncabezadoSeccion titulo="Calendario de contenido" color="#8B5CF6" />
        {pendientesMes > 0 && (
          <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 700, padding: "5px 12px", borderRadius: 20, background: "#F3E8FF", color: "#7E22CE", marginBottom: 26 }}>
            {pendientesMes} pendiente{pendientesMes !== 1 ? "s" : ""} este mes
          </span>
        )}
      </div>

      <div
        style={{
          background: COLORS.accentSoft,
          border: "1px solid #C7D6EA",
          borderRadius: 10,
          padding: "12px 16px",
          marginBottom: 18,
          fontFamily: "Inter, sans-serif",
          fontSize: 12.5,
          color: COLORS.navy,
          lineHeight: 1.6,
        }}
      >
        <strong><Icono tipo="calendario" size={13} style={{ marginRight: 4, verticalAlign: -2 }} /> Planeador de contenido:</strong> organiza qué se sube, en qué red (Instagram, Facebook, TikTok) y cuándo. No publica nada
        automáticamente — es la agenda para no perder el hilo. Lo pendiente para hoy o vencido aparece en la campana de notificaciones.
      </div>

      <EstrategiaContenidoCard estrategia={estrategia} cargado={estrategiaCargada} onGuardar={guardarEstrategia} />

      <CommunityManagerIA estrategia={estrategia} onGuardarIdeas={agregarVarias} />

      <Card style={{ marginBottom: 20 }}>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 700, color: COLORS.ink, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}><Icono tipo="foco" size={15} /> Banco de ideas rápidas</p>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted, marginBottom: 12 }}>
          Pide ideas a la IA (con o sin tema) y guárdalas aquí. Cuando quieras usar una, la conviertes en una entrada del calendario con un clic.
        </p>
        <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          <input
            className="drx-input"
            style={{ ...inputStyle, flex: 1, minWidth: 220 }}
            placeholder="Tema u ocasión (opcional): herencias, tips laborales, fin de año..."
            value={temaIdeas}
            onChange={(e) => setTemaIdeas(e.target.value)}
          />
          <button className="drx-btn-primary" style={buttonPrimary} onClick={pedirIdeas} disabled={generandoIdeas}>
            {generandoIdeas ? (
              "Generando..."
            ) : (
              <>
                <Icono tipo="chispa" size={13} style={{ marginRight: 4, verticalAlign: -2 }} /> Generar 5 ideas
              </>
            )}
          </button>
        </div>
        {ideas.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {ideas.map((idea) => (
              <div
                key={idea.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  background: COLORS.surfaceSoft,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 8,
                  padding: "9px 12px",
                  flexWrap: "wrap",
                }}
              >
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.inkSoft, margin: 0, flex: 1, minWidth: 160 }}>{idea.texto}</p>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button
                    className="drx-btn-ghost"
                    style={{ ...buttonGhost, fontSize: 11.5, padding: "5px 10px" }}
                    onClick={() => {
                      navigator.clipboard?.writeText(idea.texto);
                      setIdeaCopiada(idea.id);
                      setTimeout(() => setIdeaCopiada(""), 1500);
                    }}
                  >
                    {ideaCopiada === idea.id ? (
                      "✓ Copiado"
                    ) : (
                      <>
                        <Icono tipo="portapapeles" size={13} style={{ marginRight: 4, verticalAlign: -2 }} /> Copiar
                      </>
                    )}
                  </button>
                  <button className="drx-btn-ghost" style={{ ...buttonGhost, fontSize: 11.5, padding: "5px 10px" }} onClick={() => usarIdea(idea)}>
                    + Al calendario
                  </button>
                  <button className="drx-btn-ghost" style={{ ...buttonGhost, fontSize: 11.5, padding: "5px 10px" }} onClick={() => eliminarIdea(idea.id)}>
                    Descartar
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted }}>Aún no has generado ideas. Prueba con el botón de arriba.</p>
        )}
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <button className="drx-btn-ghost" style={buttonGhost} onClick={() => setMesActual((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}>
            ←
          </button>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 700, color: COLORS.ink, margin: 0, textTransform: "capitalize" }}>
            {mesActual.toLocaleDateString("es-CO", { month: "long", year: "numeric" })}
          </p>
          <button className="drx-btn-ghost" style={buttonGhost} onClick={() => setMesActual((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}>
            →
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
          {["D", "L", "M", "M", "J", "V", "S"].map((d, i) => (
            <p key={i} style={{ fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 700, color: COLORS.muted, textAlign: "center", margin: 0 }}>
              {d}
            </p>
          ))}
        </div>

        {semanas.map((semana, si) => (
          <div key={si} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
            {semana.map((dia, di) => {
              if (!dia) return <div key={di} />;
              const iso = fechaISO(dia);
              const itemsDia = porFecha[iso] || [];
              const esHoy = iso === hoyISO;
              const esSeleccionado = iso === diaSeleccionado;
              return (
                <button
                  key={di}
                  onClick={() => setDiaSeleccionado(iso)}
                  style={{
                    aspectRatio: "1",
                    borderRadius: 8,
                    border: esSeleccionado ? `2px solid ${COLORS.navy}` : esHoy ? `1px solid ${COLORS.accentBright}` : `1px solid ${COLORS.border}`,
                    background: esSeleccionado ? COLORS.accentSoft : "transparent",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 2,
                    fontFamily: "Inter, sans-serif",
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: esHoy ? 800 : 500, color: COLORS.ink }}>{dia.getDate()}</span>
                  {itemsDia.length > 0 && (
                    <div style={{ display: "flex", gap: 2, marginTop: 2, flexWrap: "wrap", justifyContent: "center" }}>
                      {itemsDia.slice(0, 3).map((it) => (
                        <span key={it.id} style={{ width: 5, height: 5, borderRadius: "50%", background: COLOR_ESTADO_CONTENIDO[it.estado] || COLORS.muted }} />
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </Card>

      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 700, color: COLORS.ink, margin: 0, textTransform: "capitalize" }}>
            {new Date(`${diaSeleccionado}T00:00:00`).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <button className="drx-btn-primary" style={buttonPrimary} onClick={() => abrirNuevo(diaSeleccionado)}>
            + Agregar
          </button>
        </div>

        {itemsDelDia.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {itemsDelDia.map((it) => (
              <div key={it.id} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <p style={{ fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 700, color: COLORS.ink, margin: 0 }}>
                      {it.hora ? `${it.hora} · ` : ""}
                      {it.titulo}
                    </p>
                    <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, color: COLORS.muted, margin: "3px 0 0" }}>
                      {(it.plataformas || []).join(" · ")}
                      {it.asignadoA ? ` · Asignado a ${it.asignadoA}` : ""}
                    </p>
                    {it.notas && <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.inkSoft, margin: "6px 0 0" }}>{it.notas}</p>}
                  </div>
                  <span
                    style={{
                      fontFamily: "Inter, sans-serif",
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#FFFFFF",
                      background: COLOR_ESTADO_CONTENIDO[it.estado] || COLORS.muted,
                      borderRadius: 20,
                      padding: "3px 10px",
                      flexShrink: 0,
                    }}
                  >
                    {it.estado}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  {it.estado !== "Publicado" && (
                    <button className="drx-btn-ghost" style={{ ...buttonGhost, fontSize: 11.5, padding: "5px 10px" }} onClick={() => actualizar(it.id, { estado: "Publicado" })}>
                      ✓ Marcar publicado
                    </button>
                  )}
                  <button className="drx-btn-ghost" style={{ ...buttonGhost, fontSize: 11.5, padding: "5px 10px" }} onClick={() => abrirEdicion(it)}>
                    Editar
                  </button>
                  <button
                    className="drx-btn-ghost"
                    style={{ ...buttonGhost, fontSize: 11.5, padding: "5px 10px" }}
                    onClick={() => {
                      const fechaSiguiente = new Date(`${it.fecha}T12:00:00`);
                      fechaSiguiente.setDate(fechaSiguiente.getDate() + 7);
                      crear({ titulo: it.titulo, plataformas: it.plataformas || [], fecha: fechaSiguiente.toISOString().slice(0, 10), hora: it.hora || "", estado: "Idea", asignadoA: it.asignadoA || "", notas: it.notas || "" });
                    }}
                    title="Crea una copia de esta idea 7 días después"
                  >
                    Repetir en 1 semana
                  </button>
                  <button className="drx-btn-ghost" style={{ ...buttonGhost, fontSize: 11.5, padding: "5px 10px" }} onClick={() => eliminar(it.id)}>
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.muted }}>Nada programado este día.</p>
        )}
      </Card>

      {mostrarForm && (
        <Card>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 15, fontWeight: 700, color: COLORS.ink, marginBottom: 12 }}>
            {editandoId ? "Editar entrada" : "Nueva entrada"}
          </p>
          <div className="drx-grid-form" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Título / qué se sube">
              <input
                className="drx-input"
                style={inputStyle}
                value={form.titulo}
                onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
                placeholder="Ej: Reel - 3 errores en contratos de arriendo"
              />
            </Field>
            <Field label="Asignado a">
              <select className="drx-input" style={inputStyle} value={form.asignadoA} onChange={(e) => setForm((f) => ({ ...f, asignadoA: e.target.value }))}>
                <option value="">Sin asignar</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.nombre}>
                    {u.nombre}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Fecha">
              <input type="date" className="drx-input" style={inputStyle} value={form.fecha} onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))} />
            </Field>
            <Field label="Hora (opcional)">
              <input type="time" className="drx-input" style={inputStyle} value={form.hora} onChange={(e) => setForm((f) => ({ ...f, hora: e.target.value }))} />
            </Field>
            <Field label="Estado">
              <select className="drx-input" style={inputStyle} value={form.estado} onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value }))}>
                {ESTADOS_CONTENIDO.map((e) => (
                  <option key={e}>{e}</option>
                ))}
              </select>
            </Field>
          </div>
          <div style={{ marginTop: 12 }}>
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, color: COLORS.inkSoft, marginBottom: 6 }}>Plataformas</p>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              {PLATAFORMAS_CONTENIDO.map((p) => (
                <label key={p} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.inkSoft, cursor: "pointer" }}>
                  <input type="checkbox" checked={form.plataformas.includes(p)} onChange={() => alternarPlataforma(p)} />
                  {p}
                </label>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <Field label="Guion / notas (opcional)">
              <textarea
                className="drx-input"
                style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
                value={form.notas}
                onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
              />
            </Field>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
            <button className="drx-btn-primary" style={buttonPrimary} onClick={guardar} disabled={!form.titulo.trim() || !form.fecha}>
              {editandoId ? "Guardar cambios" : "Agregar al calendario"}
            </button>
            <button
              className="drx-btn-ghost"
              style={buttonGhost}
              onClick={() => {
                setMostrarForm(false);
                setEditandoId(null);
              }}
            >
              Cancelar
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}
