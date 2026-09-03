import { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabaseClient";
import { storageGet, storageSet, getNombreDespacho } from "../lib/storage";
import {
  COLORS, uid, registrarAuditoria, diasDesde, exportarCSV, useIndex, useConfirmarDialogo,
  useAvisoAntesDeSalir, useUsuariosDespacho, Field, inputStyle, CampoDinero, buttonPrimary,
  buttonGhost, Card, EncabezadoSeccion, Icono, AvatarIniciales, EstadoVacio, LineaDeTiempo,
  TIPOS_PROCESO, AREAS_PROCESO, COLOR_AREA_PROCESO, DIAS_ALERTA_INACTIVIDAD, numeroWhatsappCliente,
} from "../App.jsx";

const FORM_CLIENTE_INICIAL = {
  nombre: "",
  telefono: "",
  email: "",
  tipoProceso: TIPOS_PROCESO[0],
  areaProceso: AREAS_PROCESO[0],
  radicado: "",
  notas: "",
  planPago: null,
  valorTotal: "",
  abogadoAsignado: "",
  otrasPersonas: [],
};

// Un contrato o proceso muchas veces no es con una sola persona — un
// arriendo con dos arrendatarios, una sucesión entre varios herederos, una
// sociedad con varios socios. Esto deja agregar a las demás personas
// involucradas sin tener que crear un "cliente" aparte por cada una.
function EditorOtrasPersonas({ personas, onChange }) {
  const lista = personas || [];

  const agregar = () => onChange([...lista, { id: uid(), nombre: "", telefono: "", rol: "" }]);
  const quitar = (id) => onChange(lista.filter((p) => p.id !== id));
  const actualizar = (id, campo, valor) => onChange(lista.map((p) => (p.id === id ? { ...p, [campo]: valor } : p)));

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: lista.length > 0 ? 8 : 0 }}>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: 600, color: COLORS.inkSoft, margin: 0 }}>
          Otras personas en este mismo contrato o proceso (opcional)
        </p>
        <button className="drx-btn-ghost" style={{ ...buttonGhost, padding: "5px 10px", fontSize: 12 }} onClick={agregar}>
          + Agregar persona
        </button>
      </div>
      {lista.map((p) => (
        <div key={p.id} className="drx-grid-form" style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr auto", gap: 8, marginTop: 8, alignItems: "center" }}>
          <input className="drx-input" style={{ ...inputStyle, padding: "8px 10px", fontSize: 13 }} value={p.nombre} onChange={(e) => actualizar(p.id, "nombre", e.target.value)} placeholder="Nombre completo" />
          <input className="drx-input" style={{ ...inputStyle, padding: "8px 10px", fontSize: 13 }} value={p.telefono} onChange={(e) => actualizar(p.id, "telefono", e.target.value)} placeholder="Teléfono (opcional)" />
          <input className="drx-input" style={{ ...inputStyle, padding: "8px 10px", fontSize: 13 }} value={p.rol} onChange={(e) => actualizar(p.id, "rol", e.target.value)} placeholder="Rol (ej: cónyuge, socio)" />
          <button onClick={() => quitar(p.id)} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.muted, display: "flex" }} title="Quitar">
            <Icono tipo="check" size={14} style={{ transform: "rotate(45deg)" }} />
          </button>
        </div>
      ))}
    </div>
  );
}

const FRECUENCIAS_PAGO = ["Semanal", "Quincenal", "Mensual", "Pago único", "Otro"];

async function organizarPagoConIA(descripcion) {
  const hoy = new Date().toISOString().slice(0, 10);
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
      max_tokens: 300,
      system:
        `Eres un asistente que organiza la forma de pago de un cliente de un despacho de abogados en Colombia. Hoy es ${hoy}. ` +
        `A partir de la descripción en lenguaje natural que te da el abogado, responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin comillas de bloque de código, con exactamente estos campos: ` +
        `{"frecuencia": uno de "Semanal", "Quincenal", "Mensual", "Pago único" u "Otro"; "valor": número entero en pesos colombianos sin puntos ni símbolos; "proximaFecha": fecha en formato YYYY-MM-DD de la próxima vez que el cliente debe pagar, calculada a partir de hoy y de la descripción; "resumen": una frase corta en español resumiendo el acuerdo de pago}.`,
      messages: [{ role: "user", content: descripcion }],
    }),
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || "No se pudo contactar al asistente de IA");
  const texto = (data.content || []).map((b) => b.text || "").join("");
  const limpio = texto.replace(/```json|```/g, "").trim();
  return JSON.parse(limpio);
}

function PlanDePagoIA({ planPago, onChange }) {
  const [descripcion, setDescripcion] = useState(planPago?.descripcion || "");
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");

  const organizar = async () => {
    if (!descripcion.trim()) return;
    setProcesando(true);
    setError("");
    try {
      const resultado = await organizarPagoConIA(descripcion.trim());
      onChange({ descripcion: descripcion.trim(), ...resultado });
    } catch (e) {
      setError("No pudimos organizarlo automáticamente. Completa los campos manualmente abajo.");
      onChange({ descripcion: descripcion.trim(), frecuencia: FRECUENCIAS_PAGO[0], valor: null, proximaFecha: "", resumen: "" });
    }
    setProcesando(false);
  };

  return (
    <div style={{ background: COLORS.surfaceSoft, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 14 }}>
      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: 600, color: COLORS.navy, marginBottom: 8, textAlign: "left" }}>
        ¿Cómo paga este cliente?
      </p>
      <textarea
        className="drx-input"
        style={{ ...inputStyle, display: "block", width: "100%", boxSizing: "border-box", minHeight: 110, fontSize: 14, resize: "vertical" }}
        placeholder='Descríbelo con tus palabras, ej: "Paga $500.000 mensual, siempre el día 5" o "Cuota única de 2 millones el 15 de septiembre"'
        value={descripcion}
        onChange={(e) => setDescripcion(e.target.value)}
      />
      <button
        className="drx-btn-ghost"
        style={{ ...buttonGhost, display: "block", marginTop: 10, fontSize: 12.5, padding: "8px 16px", textAlign: "left" }}
        onClick={organizar}
        disabled={procesando || !descripcion.trim()}
      >
        {procesando ? "Organizando..." : "Organizar con IA"}
      </button>
      {error && <p style={{ color: "#B45309", fontSize: 12, marginTop: 8, fontFamily: "Inter, sans-serif", textAlign: "left" }}>{error}</p>}

      {planPago && (
        <div style={{ marginTop: 12, borderTop: `1px solid ${COLORS.border}`, paddingTop: 12, textAlign: "left" }}>
          {planPago.resumen && (
            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.inkSoft, marginBottom: 10, fontStyle: "italic" }}>"{planPago.resumen}"</p>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <Field label="Frecuencia">
              <select
                className="drx-input"
                style={{ ...inputStyle, fontSize: 12.5, padding: "7px 8px" }}
                value={planPago.frecuencia || FRECUENCIAS_PAGO[0]}
                onChange={(e) => onChange({ ...planPago, frecuencia: e.target.value })}
              >
                {FRECUENCIAS_PAGO.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Valor (COP)">
              <CampoDinero
                style={{ ...inputStyle, fontSize: 12.5, padding: "7px 8px" }}
                value={planPago.valor || ""}
                onChange={(e) => onChange({ ...planPago, valor: Number(e.target.value) })}
              />
            </Field>
            <Field label="Próxima fecha">
              <input
                type="date"
                className="drx-input"
                style={{ ...inputStyle, fontSize: 12.5, padding: "7px 8px" }}
                value={planPago.proximaFecha || ""}
                onChange={(e) => onChange({ ...planPago, proximaFecha: e.target.value })}
              />
            </Field>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ClientesTab({ usuarioActual }) {
  const { ids, cargado, addId, removeId } = useIndex("indice-clientes", false);
  const { usuarios: abogadosDespacho } = useUsuariosDespacho();
  const [clientes, setClientes] = useState({});
  const [form, setForm] = useState(FORM_CLIENTE_INICIAL);
  const [showForm, setShowForm] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [formEdicion, setFormEdicion] = useState({});
  const [filtro, setFiltro] = useState("");
  const [copiado, setCopiado] = useState("");
  const [orden, setOrden] = useState("recientes");
  useAvisoAntesDeSalir(showForm && !!form.nombre.trim());
  const [soloSinRadicado, setSoloSinRadicado] = useState(false);
  const [soloInactivos, setSoloInactivos] = useState(false);
  const [toastGuardado, setToastGuardado] = useState("");
  const { confirmar, ConfirmarDialogo } = useConfirmarDialogo();

  useEffect(() => {
    (async () => {
      const entries = {};
      for (const id of ids) {
        const raw = await storageGet(`cliente:${id}`, false);
        if (raw) entries[id] = JSON.parse(raw);
      }
      setClientes(entries);
    })();
  }, [ids]);

  const copiar = (texto, etiqueta) => {
    navigator.clipboard?.writeText(texto);
    setCopiado(etiqueta);
    setTimeout(() => setCopiado(""), 1500);
  };

  const guardar = async () => {
    if (!form.nombre.trim()) return;
    const id = uid();
    const proximoPago = form.planPago?.proximaFecha ? { fecha: form.planPago.proximaFecha, valorEsperado: form.planPago.valor } : null;
    await storageSet(`cliente:${id}`, JSON.stringify({ ...form, timeline: [], ultimaActuacion: new Date().toISOString(), proximoPago }), false);
    await addId(id);
    registrarAuditoria(usuarioActual, "crear_cliente", "cliente", id, { nombre: form.nombre });
    setToastGuardado(`"${form.nombre}" se guardó correctamente`);
    setTimeout(() => setToastGuardado(""), 2800);
    setForm(FORM_CLIENTE_INICIAL);
    setShowForm(false);
  };

  const empezarEdicion = (id) => {
    setEditandoId(id);
    setFormEdicion(clientes[id]);
  };

  const guardarEdicion = async (id) => {
    if (!formEdicion.nombre?.trim()) return;
    const proximoPago = formEdicion.planPago?.proximaFecha
      ? { fecha: formEdicion.planPago.proximaFecha, valorEsperado: formEdicion.planPago.valor }
      : formEdicion.proximoPago || null;
    const actualizado = { ...formEdicion, proximoPago };
    await storageSet(`cliente:${id}`, JSON.stringify(actualizado), false);
    setClientes((prev) => ({ ...prev, [id]: actualizado }));
    setEditandoId(null);
  };

  const agregarActuacion = async (id, nota) => {
    const c = clientes[id];
    const nuevaEntrada = { id: uid(), fecha: new Date().toISOString(), nota };
    const actualizado = { ...c, timeline: [...(c.timeline || []), nuevaEntrada], ultimaActuacion: new Date().toISOString() };
    await storageSet(`cliente:${id}`, JSON.stringify(actualizado), false);
    setClientes((prev) => ({ ...prev, [id]: actualizado }));
  };

  // Ordenar + filtrar recorre TODOS los clientes — se memoiza para que no se
  // repita en cada render (por ejemplo, cada tecla escrita en el formulario
  // de un cliente que ni siquiera está en la lista filtrada), que en
  // despachos con muchos clientes se sentía como que la pantalla iba lenta.
  const idsFiltrados = useMemo(() => {
    const idsOrdenados = [...ids].sort((a, b) => {
      if (orden === "az") return (clientes[a]?.nombre || "").localeCompare(clientes[b]?.nombre || "");
      if (orden === "pago") {
        const pa = clientes[a]?.proximoPago?.fecha || "9999-99-99";
        const pb = clientes[b]?.proximoPago?.fecha || "9999-99-99";
        return pa.localeCompare(pb);
      }
      const fa = clientes[a]?.ultimaActuacion || "";
      const fb = clientes[b]?.ultimaActuacion || "";
      return fb.localeCompare(fa);
    });

    const textoFiltro = filtro.trim().toLowerCase();
    let resultado = textoFiltro
      ? idsOrdenados.filter((id) => {
          const c = clientes[id];
          if (!c) return false;
          return (
            c.nombre?.toLowerCase().includes(textoFiltro) ||
            c.radicado?.toLowerCase().includes(textoFiltro) ||
            c.telefono?.toLowerCase().includes(textoFiltro)
          );
        })
      : idsOrdenados;
    if (soloSinRadicado) resultado = resultado.filter((id) => !clientes[id]?.radicado?.trim());
    if (soloInactivos) {
      resultado = resultado.filter((id) => {
        const dias = diasDesde(clientes[id]?.ultimaActuacion);
        return dias !== null && dias >= DIAS_ALERTA_INACTIVIDAD;
      });
    }
    return resultado;
  }, [ids, clientes, orden, filtro, soloSinRadicado, soloInactivos]);

  return (
    <div>
      <EncabezadoSeccion titulo="Clientes" color="#14B8A6" />
      <div style={{ marginBottom: 14, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input
          className="drx-input"
          style={{ ...inputStyle, maxWidth: 320, flex: 1, minWidth: 220 }}
          placeholder="Filtrar por nombre, radicado o teléfono..."
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        />
        <div style={{ display: "flex", border: `1px solid ${COLORS.border}`, borderRadius: 8, overflow: "hidden" }}>
          <button
            onClick={() => setOrden("recientes")}
            style={{
              border: "none",
              padding: "8px 14px",
              fontFamily: "Inter, sans-serif",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              background: orden === "recientes" ? COLORS.accentSoft : COLORS.panel,
              color: orden === "recientes" ? COLORS.navy : COLORS.muted,
            }}
          >
            Recientes
          </button>
          <button
            onClick={() => setOrden("az")}
            style={{
              border: "none",
              padding: "8px 14px",
              fontFamily: "Inter, sans-serif",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              background: orden === "az" ? COLORS.accentSoft : COLORS.panel,
              color: orden === "az" ? COLORS.navy : COLORS.muted,
            }}
          >
            A-Z
          </button>
          <button
            onClick={() => setOrden("pago")}
            style={{
              border: "none",
              padding: "8px 14px",
              fontFamily: "Inter, sans-serif",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              background: orden === "pago" ? COLORS.accentSoft : COLORS.panel,
              color: orden === "pago" ? COLORS.navy : COLORS.muted,
            }}
          >
            Próximo pago
          </button>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.inkSoft, cursor: "pointer" }}>
          <input type="checkbox" checked={soloSinRadicado} onChange={(e) => setSoloSinRadicado(e.target.checked)} />
          Solo sin radicado
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.inkSoft, cursor: "pointer" }}>
          <input type="checkbox" checked={soloInactivos} onChange={(e) => setSoloInactivos(e.target.checked)} />
          Solo inactivos
        </label>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.muted, margin: 0 }}>
          {idsFiltrados.length} cliente{idsFiltrados.length !== 1 ? "s" : ""}
          {filtro.trim()
            ? ` de ${ids.length}`
            : orden === "az"
            ? " · orden alfabético"
            : orden === "pago"
            ? " · ordenados por próximo pago"
            : " · ordenados por última actuación"}
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className="drx-btn-ghost"
            style={buttonGhost}
            onClick={() =>
              exportarCSV(
                "clientes.csv",
                [
                  { titulo: "Nombre", valor: (id) => clientes[id]?.nombre },
                  { titulo: "Teléfono", valor: (id) => clientes[id]?.telefono },
                  { titulo: "Correo", valor: (id) => clientes[id]?.email },
                  { titulo: "Radicado", valor: (id) => clientes[id]?.radicado },
                  { titulo: "Tipo de proceso", valor: (id) => clientes[id]?.tipoProceso },
                  { titulo: "Área", valor: (id) => clientes[id]?.areaProceso },
                  { titulo: "Valor total acordado", valor: (id) => clientes[id]?.valorTotal },
                  { titulo: "Notas", valor: (id) => clientes[id]?.notas },
                ],
                idsOrdenados
              )
            }
          >
            Exportar CSV
          </button>
          <button className="drx-btn-primary drx-cta-shine" style={buttonPrimary} onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancelar" : "+ Nuevo cliente"}
          </button>
        </div>
      </div>

      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div className="drx-grid-form" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Nombre principal (contacto)">
              <input className="drx-input" style={inputStyle} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </Field>
            <Field label="Teléfono">
              <input className="drx-input" style={inputStyle} value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
            </Field>
            <Field label="Correo">
              <input className="drx-input" style={inputStyle} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Número de radicado (opcional)">
              <input className="drx-input" style={inputStyle} value={form.radicado} onChange={(e) => setForm({ ...form, radicado: e.target.value })} placeholder="Ej: 11001310300120240012300" />
            </Field>
            <Field label="Tipo de proceso">
              <select className="drx-input" style={inputStyle} value={form.tipoProceso} onChange={(e) => setForm({ ...form, tipoProceso: e.target.value })}>
                {TIPOS_PROCESO.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Área del proceso">
              <select className="drx-input" style={inputStyle} value={form.areaProceso} onChange={(e) => setForm({ ...form, areaProceso: e.target.value })}>
                {AREAS_PROCESO.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Valor total acordado (opcional)">
              <CampoDinero
                style={inputStyle}
                value={form.valorTotal}
                onChange={(e) => setForm({ ...form, valorTotal: e.target.value })}
                placeholder="Ej: 3.000.000"
              />
            </Field>
            <Field label="Abogado asignado (opcional)">
              <select className="drx-input" style={inputStyle} value={form.abogadoAsignado} onChange={(e) => setForm({ ...form, abogadoAsignado: e.target.value })}>
                <option value="">Sin asignar</option>
                {abogadosDespacho.map((u) => (
                  <option key={u.id} value={u.nombre}>
                    {u.nombre}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div style={{ marginTop: 12, marginBottom: 12 }}>
            <Field label="Notas">
              <input className="drx-input" style={inputStyle} value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
            </Field>
          </div>
          <EditorOtrasPersonas personas={form.otrasPersonas} onChange={(otrasPersonas) => setForm({ ...form, otrasPersonas })} />
          <PlanDePagoIA planPago={form.planPago} onChange={(planPago) => setForm({ ...form, planPago })} />
          <button className="drx-btn-primary" style={{ ...buttonPrimary, marginTop: 14 }} onClick={guardar}>
            Guardar cliente
          </button>
        </Card>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {idsFiltrados.map((id) => {
          const c = clientes[id];
          if (!c) return null;

          if (editandoId === id) {
            return (
              <Card key={id}>
                <div className="drx-grid-form" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Field label="Nombre principal (contacto)">
                    <input className="drx-input" style={inputStyle} value={formEdicion.nombre || ""} onChange={(e) => setFormEdicion({ ...formEdicion, nombre: e.target.value })} />
                  </Field>
                  <Field label="Teléfono">
                    <input className="drx-input" style={inputStyle} value={formEdicion.telefono || ""} onChange={(e) => setFormEdicion({ ...formEdicion, telefono: e.target.value })} />
                  </Field>
                  <Field label="Correo">
                    <input className="drx-input" style={inputStyle} value={formEdicion.email || ""} onChange={(e) => setFormEdicion({ ...formEdicion, email: e.target.value })} />
                  </Field>
                  <Field label="Número de radicado (opcional)">
                    <input className="drx-input" style={inputStyle} value={formEdicion.radicado || ""} onChange={(e) => setFormEdicion({ ...formEdicion, radicado: e.target.value })} />
                  </Field>
                  <Field label="Tipo de proceso">
                    <select className="drx-input" style={inputStyle} value={formEdicion.tipoProceso || TIPOS_PROCESO[0]} onChange={(e) => setFormEdicion({ ...formEdicion, tipoProceso: e.target.value })}>
                      {TIPOS_PROCESO.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Área del proceso">
                    <select className="drx-input" style={inputStyle} value={formEdicion.areaProceso || AREAS_PROCESO[0]} onChange={(e) => setFormEdicion({ ...formEdicion, areaProceso: e.target.value })}>
                      {AREAS_PROCESO.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Valor total acordado (opcional)">
                    <CampoDinero
                      style={inputStyle}
                      value={formEdicion.valorTotal || ""}
                      onChange={(e) => setFormEdicion({ ...formEdicion, valorTotal: e.target.value })}
                    />
                  </Field>
                  <Field label="Abogado asignado (opcional)">
                    <select
                      className="drx-input"
                      style={inputStyle}
                      value={formEdicion.abogadoAsignado || ""}
                      onChange={(e) => setFormEdicion({ ...formEdicion, abogadoAsignado: e.target.value })}
                    >
                      <option value="">Sin asignar</option>
                      {abogadosDespacho.map((u) => (
                        <option key={u.id} value={u.nombre}>
                          {u.nombre}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div style={{ marginTop: 12, marginBottom: 12 }}>
                  <Field label="Notas">
                    <input className="drx-input" style={inputStyle} value={formEdicion.notas || ""} onChange={(e) => setFormEdicion({ ...formEdicion, notas: e.target.value })} />
                  </Field>
                </div>
                <EditorOtrasPersonas personas={formEdicion.otrasPersonas} onChange={(otrasPersonas) => setFormEdicion({ ...formEdicion, otrasPersonas })} />
                <PlanDePagoIA planPago={formEdicion.planPago} onChange={(planPago) => setFormEdicion({ ...formEdicion, planPago })} />
                <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                  <button className="drx-btn-ghost" style={buttonGhost} onClick={() => setEditandoId(null)}>
                    Cancelar
                  </button>
                  <button className="drx-btn-primary" style={buttonPrimary} onClick={() => guardarEdicion(id)}>
                    Guardar cambios
                  </button>
                </div>
              </Card>
            );
          }

          const dias = diasDesde(c.ultimaActuacion);
          const inactivo = dias !== null && dias >= DIAS_ALERTA_INACTIVIDAD;

          return (
            <Card key={id} style={{ borderLeft: `4px solid ${COLOR_AREA_PROCESO[c.areaProceso] || "#14B8A6"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1, display: "flex", gap: 12 }}>
                  <AvatarIniciales nombre={c.nombre} />
                  <div style={{ flex: 1 }}>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 17, fontWeight: 700, margin: 0, color: COLORS.ink }}>{c.nombre}</p>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.muted, margin: "4px 0 0", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                    {c.telefono && (
                      <span
                        title="Copiar teléfono"
                        onClick={() => copiar(c.telefono, `tel-${id}`)}
                        style={{ cursor: "pointer", textDecoration: copiado === `tel-${id}` ? "none" : "underline dotted", color: copiado === `tel-${id}` ? "#1DA851" : COLORS.muted }}
                      >
                        {copiado === `tel-${id}` ? "✓ Copiado" : c.telefono}
                      </span>
                    )}
                    {c.telefono && (
                      <a href={`tel:${c.telefono.replace(/[^0-9+]/g, "")}`} title="Llamar" style={{ color: COLORS.accentBright, textDecoration: "none", fontWeight: 600 }}>
                        <Icono tipo="telefono" size={13} style={{ marginRight: 4, verticalAlign: -2 }} /> Llamar
                      </a>
                    )}
                    {c.telefono && c.email && "·"}
                    {c.email && (
                      <span
                        title="Copiar correo"
                        onClick={() => copiar(c.email, `mail-${id}`)}
                        style={{ cursor: "pointer", textDecoration: copiado === `mail-${id}` ? "none" : "underline dotted", color: copiado === `mail-${id}` ? "#1DA851" : COLORS.muted }}
                      >
                        {copiado === `mail-${id}` ? "✓ Copiado" : c.email}
                      </span>
                    )}
                  </p>
                  {c.otrasPersonas?.length > 0 && (
                    <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, margin: "4px 0 0", display: "flex", alignItems: "center", gap: 5 }}>
                      <Icono tipo="persona" size={12} /> También: {c.otrasPersonas.map((p) => p.nombre + (p.rol ? ` (${p.rol})` : "")).filter(Boolean).join(", ")}
                    </p>
                  )}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    {c.tipoProceso && (
                      <span style={{ fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 20, background: COLORS.accentSoft, color: COLORS.navy, border: "1px solid #C7D6EA" }}>
                        {c.tipoProceso}
                      </span>
                    )}
                    {c.areaProceso && (
                      <span style={{ fontFamily: "Inter, sans-serif", fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 20, background: "#F0F0F0", color: COLORS.black, border: "1px solid #D8D8D8" }}>
                        {c.areaProceso}
                      </span>
                    )}
                    {c.radicado && (
                      <span
                        title="Copiar radicado"
                        onClick={() => copiar(c.radicado, `rad-${id}`)}
                        style={{
                          fontFamily: "monospace",
                          fontSize: 11,
                          padding: "3px 9px",
                          borderRadius: 20,
                          background: copiado === `rad-${id}` ? "#E4EEE2" : COLORS.surfaceSoft,
                          color: copiado === `rad-${id}` ? "#2F5D3A" : COLORS.inkSoft,
                          border: `1px solid ${copiado === `rad-${id}` ? "#C9E0C4" : COLORS.border}`,
                          cursor: "pointer",
                        }}
                      >
                        {copiado === `rad-${id}` ? "✓ Copiado" : `Radicado: ${c.radicado}`}
                      </span>
                    )}
                    {c.proximoPago?.fecha && (
                      <span
                        style={{
                          fontFamily: "Inter, sans-serif",
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "3px 9px",
                          borderRadius: 20,
                          background: "#EEF2FF",
                          color: "#4338CA",
                          border: "1px solid #DDE3FB",
                        }}
                      >
                        <Icono tipo="calendario" size={10} style={{ marginRight: 3, verticalAlign: -1 }} />
                        Próximo pago: {new Date(`${c.proximoPago.fecha}T12:00:00`).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}
                      </span>
                    )}
                    <span
                      style={{
                        fontFamily: "Inter, sans-serif",
                        fontSize: 11,
                        fontWeight: 600,
                        padding: "3px 9px",
                        borderRadius: 20,
                        background: inactivo ? "#FEF3E2" : "#E4EEE2",
                        color: inactivo ? "#B45309" : "#2F5D3A",
                        border: `1px solid ${inactivo ? "#FCE3B8" : "#C9E0C4"}`,
                      }}
                    >
                      {dias === null ? "Sin actuaciones" : dias === 0 ? "Actuación hoy" : `Hace ${dias} día${dias !== 1 ? "s" : ""}`}
                    </span>
                  </div>
                  {c.notas && <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.inkSoft, margin: "8px 0 0" }}>{c.notas}</p>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
                  <button
                    className="drx-btn-ghost"
                    style={{ ...buttonGhost, background: "#1DA851", color: "#FFFFFF", border: "none" }}
                    onClick={() => {
                      const numero = numeroWhatsappCliente(c.telefono);
                      const mensaje = `Hola ${c.nombre || ""} 👋\n\n*${getNombreDespacho()}* te comparte acceso a tu portal personal, donde puedes ver el estado de tu proceso y tu estado de cuenta cuando quieras.\n\n1️⃣ Ingresa aquí: ${window.location.origin}/#portal\n2️⃣ Escribe este código: *${id}*`;
                      window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`, "_blank");
                    }}
                  >
                    Compartir portal ↗
                  </button>
                  <button
                    className="drx-btn-ghost"
                    style={buttonGhost}
                    title="Copiar nombre, teléfono, correo y radicado"
                    onClick={() => {
                      const datos = [
                        c.nombre,
                        c.telefono ? `Tel: ${c.telefono}` : null,
                        c.email ? `Correo: ${c.email}` : null,
                        c.radicado ? `Radicado: ${c.radicado}` : null,
                      ]
                        .filter(Boolean)
                        .join("\n");
                      copiar(datos, `todo-${id}`);
                    }}
                  >
                    {copiado === `todo-${id}` ? "✓ Copiado" : "Copiar datos"}
                  </button>
                  <button className="drx-btn-ghost" style={buttonGhost} onClick={() => empezarEdicion(id)}>
                    Editar
                  </button>
                  <button
                    className="drx-btn-ghost"
                    style={buttonGhost}
                    onClick={async () => {
                      if (!(await confirmar(`¿Eliminar a ${c.nombre}? Puedes recuperarlo después desde la Papelera.`))) return;
                      removeId(id);
                      registrarAuditoria(usuarioActual, "eliminar_cliente", "cliente", id, { nombre: c.nombre });
                    }}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
              <LineaDeTiempo cliente={c} onAgregar={(nota) => agregarActuacion(id, nota)} />
            </Card>
          );
        })}
        {cargado && ids.length === 0 && !showForm && <EstadoVacio icono={<Icono tipo="persona" size={26} />} texto="Aún no has registrado clientes." />}
        {ids.length > 0 && idsFiltrados.length === 0 && (
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.muted, textAlign: "center" }}>Ningún cliente coincide con "{filtro}".</p>
        )}
      </div>
      {toastGuardado && (
        <div
          className="drx-fade-in"
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 200,
            background: "#0B3D2E",
            color: "#FFFFFF",
            padding: "12px 18px",
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontFamily: "Inter, sans-serif",
            fontSize: 13,
            fontWeight: 600,
            boxShadow: "0 10px 30px rgba(11,61,46,0.35)",
          }}
        >
          <Icono tipo="check" size={15} /> {toastGuardado}
        </div>
      )}
      {ConfirmarDialogo}
    </div>
  );
}
