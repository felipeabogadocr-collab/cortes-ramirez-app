import { useState, useEffect, useMemo } from "react";
import { storageSet, getNombreDespacho, obtenerClientesPorId } from "../lib/storage";
import {
  COLORS, uid, registrarAuditoria, diasDesde, exportarCSV, useIndex, useConfirmarDialogo,
  useAvisoAntesDeSalir, useUsuariosDespacho, Field, inputStyle, CampoDinero, buttonPrimary,
  buttonGhost, Card, EncabezadoSeccion, Icono, AvatarIniciales, EstadoVacio, LineaDeTiempo,
  AREAS_PROCESO, COLOR_AREA_PROCESO, DIAS_ALERTA_INACTIVIDAD, numeroWhatsappCliente,
  radicadosDeCliente, tiposProcesoDeArea, useServicios, calcularProximaFechaPorFrecuencia,
  fechaHoyISO, formatoCOP, leerJSONLocal, guardarJSONLocal, useReferenciadores, useAbogadosAsociados,
} from "../App.jsx";

// Enlace oficial de la Fiscalía para consultar el estado de una denuncia en
// el SPOA. No se puede automatizar esta consulta: el propio portal exige un
// reCAPTCHA en cada búsqueda, precisamente para impedir consultas masivas o
// por robot — así que esto es un acceso directo para que el abogado la haga
// a mano en un clic, no una consulta automática como la de la Rama Judicial.
const URL_CONSULTA_SPOA = "https://www.fiscalia.gov.co/servicios-de-informacion-al-ciudadano/consultas/";

// Solo en este navegador/dispositivo (no en la base de datos) — a
// propósito: es un borrador a medio llenar, no un cliente real todavía,
// así que no tiene sentido sincronizarlo entre dispositivos ni que otro
// usuario del despacho lo vea.
const LLAVE_BORRADOR_CLIENTE = "borrador-cliente-nuevo";

const FORM_CLIENTE_INICIAL = {
  nombre: "",
  telefono: "",
  email: "",
  tipoProceso: tiposProcesoDeArea(AREAS_PROCESO[0])[0],
  areaProceso: AREAS_PROCESO[0],
  radicados: [""],
  notas: "",
  planPago: null,
  valorTotal: "",
  abogadoAsignado: "",
  otrasPersonas: [],
  pagador: null,
  referenciador: null,
  abogadoAsociado: null,
};

// A veces quien paga no es el cliente: el proceso es de Pepito, pero Juan
// (un familiar, un socio) es quien hace el pago. Cuando eso pasa, los
// recordatorios de pago y la confirmación/recibo deben llegarle a quien
// realmente paga (Juan), no al cliente (Pepito) — este selector deja
// registrar a esa persona sin mezclarla con el cliente ni con "otras
// personas del proceso" (que es solo informativo, no cambia a dónde se
// manda nada).
function SelectorPagador({ pagador, onChange }) {
  const esOtraPersona = !!pagador;

  return (
    <div style={{ marginTop: 12 }}>
      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: 600, color: COLORS.inkSoft, marginBottom: 8 }}>
        ¿Quién paga las cuentas de este proceso?
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: esOtraPersona ? 10 : 0 }}>
        <button
          type="button"
          className={esOtraPersona ? "drx-btn-ghost" : "drx-btn-primary"}
          style={esOtraPersona ? { ...buttonGhost, padding: "7px 14px", fontSize: 12.5 } : { ...buttonPrimary, padding: "7px 14px", fontSize: 12.5 }}
          onClick={() => onChange(null)}
        >
          El mismo cliente
        </button>
        <button
          type="button"
          className={esOtraPersona ? "drx-btn-primary" : "drx-btn-ghost"}
          style={esOtraPersona ? { ...buttonPrimary, padding: "7px 14px", fontSize: 12.5 } : { ...buttonGhost, padding: "7px 14px", fontSize: 12.5 }}
          onClick={() => onChange(pagador || { nombre: "", telefono: "" })}
        >
          Otra persona paga
        </button>
      </div>
      {esOtraPersona && (
        <div className="drx-grid-form" style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 8 }}>
          <input
            className="drx-input"
            style={{ ...inputStyle, padding: "8px 10px", fontSize: 13 }}
            value={pagador.nombre}
            onChange={(e) => onChange({ ...pagador, nombre: e.target.value })}
            placeholder="Nombre de quien paga"
          />
          <input
            className="drx-input"
            style={{ ...inputStyle, padding: "8px 10px", fontSize: 13 }}
            value={pagador.telefono}
            onChange={(e) => onChange({ ...pagador, telefono: e.target.value })}
            placeholder="Teléfono de quien paga"
          />
        </div>
      )}
    </div>
  );
}

// Selector reutilizado para dos casos: quien refirió al cliente (comisión)
// y un abogado asociado con el que se trabaja el caso (honorarios
// compartidos). Elige de un catálogo del despacho (con memoria — se define
// una vez en Usuarios y permisos, o aquí mismo con "+ Nuevo") y el
// porcentaje que le corresponde sobre cada pago. La cuenta de cobro usa
// ese porcentaje para descontarlo y mostrar la utilidad real del despacho.
function SelectorComision({ titulo, contactosHook, valor, onChange, placeholderNombre }) {
  const { contactos, crear } = contactosHook();
  const [mostrarNuevo, setMostrarNuevo] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [telefonoNuevo, setTelefonoNuevo] = useState("");

  const elegir = (id) => {
    if (!id) {
      onChange(null);
      return;
    }
    const c = contactos.find((x) => x.id === id);
    if (c) onChange({ id: c.id, nombre: c.nombre, porcentaje: valor?.porcentaje ?? "" });
  };

  const crearRapido = async () => {
    if (!nombreNuevo.trim()) return;
    const nuevo = await crear({ nombre: nombreNuevo, telefono: telefonoNuevo });
    onChange({ id: nuevo.id, nombre: nuevo.nombre, porcentaje: valor?.porcentaje ?? "" });
    setNombreNuevo("");
    setTelefonoNuevo("");
    setMostrarNuevo(false);
  };

  return (
    <div style={{ marginTop: 12 }}>
      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: 600, color: COLORS.inkSoft, marginBottom: 8 }}>{titulo}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <Field label="Elegir">
          <select
            className="drx-input"
            style={{ ...inputStyle, fontSize: 12.5, padding: "7px 8px", minWidth: 200 }}
            value={valor?.id || ""}
            onChange={(e) => elegir(e.target.value)}
          >
            <option value="">Ninguno</option>
            {contactos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </Field>
        {valor?.id && (
          <Field label="% que le corresponde">
            <input
              type="number"
              min="0"
              max="100"
              className="drx-input"
              style={{ ...inputStyle, fontSize: 12.5, padding: "7px 8px", width: 90 }}
              value={valor.porcentaje ?? ""}
              onChange={(e) => onChange({ ...valor, porcentaje: e.target.value })}
            />
          </Field>
        )}
        <button className="drx-btn-ghost" style={{ ...buttonGhost, padding: "8px 14px", fontSize: 12.5 }} onClick={() => setMostrarNuevo((m) => !m)}>
          {mostrarNuevo ? "Cancelar" : "+ Nuevo"}
        </button>
      </div>
      {mostrarNuevo && (
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <input
            className="drx-input"
            style={{ ...inputStyle, padding: "8px 10px", fontSize: 13 }}
            value={nombreNuevo}
            onChange={(e) => setNombreNuevo(e.target.value)}
            placeholder={placeholderNombre}
          />
          <input
            className="drx-input"
            style={{ ...inputStyle, padding: "8px 10px", fontSize: 13 }}
            value={telefonoNuevo}
            onChange={(e) => setTelefonoNuevo(e.target.value)}
            placeholder="Teléfono (opcional)"
          />
          <button className="drx-btn-ghost" style={{ ...buttonGhost, padding: "8px 14px", fontSize: 12.5 }} onClick={crearRapido} disabled={!nombreNuevo.trim()}>
            Guardar
          </button>
        </div>
      )}
    </div>
  );
}

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

// Un cliente puede tener más de un proceso o más de un recurso del mismo
// proceso — cada radicado que se agregue aquí se vigila por separado en
// Vigilancia judicial (todos consultados contra la Rama Judicial, no solo
// el primero).
function EditorRadicados({ radicados, onChange }) {
  const lista = radicados && radicados.length > 0 ? radicados : [""];

  const agregar = () => onChange([...lista, ""]);
  const quitar = (idx) => onChange(lista.length > 1 ? lista.filter((_, i) => i !== idx) : [""]);
  const actualizar = (idx, valor) => onChange(lista.map((r, i) => (i === idx ? valor : r)));

  return (
    <div>
      {lista.map((r, idx) => (
        <div key={idx} style={{ display: "flex", gap: 8, marginBottom: idx < lista.length - 1 ? 8 : 0 }}>
          <input
            className="drx-input"
            style={inputStyle}
            value={r}
            onChange={(e) => actualizar(idx, e.target.value)}
            placeholder="Ej: 11001310300120240012300"
          />
          {(lista.length > 1 || r) && (
            <button
              onClick={() => quitar(idx)}
              style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.muted, display: "flex", flexShrink: 0 }}
              title="Quitar este radicado"
            >
              <Icono tipo="check" size={14} style={{ transform: "rotate(45deg)" }} />
            </button>
          )}
        </div>
      ))}
      <button className="drx-btn-ghost" style={{ ...buttonGhost, marginTop: 8, padding: "5px 10px", fontSize: 12 }} onClick={agregar}>
        + Agregar otro radicado
      </button>
    </div>
  );
}

const FRECUENCIAS_PAGO = ["Semanal", "Quincenal", "Mensual", "Pago único", "Otro"];

// Antes esto se armaba pidiéndole a una IA que interpretara una frase en
// lenguaje libre ("Paga $500.000 mensual...") y devolviera un JSON — cuando
// el modelo respondía algo mal formado (pasaba con cierta frecuencia), el
// plan de pago quedaba a medio llenar y tocaba reintentar sin entender por
// qué. Un formulario directo de "cuántas cuotas, de cuánto, cada cuánto" no
// tiene nada que interpretar ni que le pueda salir mal.
function PlanDePago({ planPago, onChange }) {
  const { servicios } = useServicios();
  const [servicioElegidoId, setServicioElegidoId] = useState("");
  const plan = planPago || {};

  const usarServicio = () => {
    const servicio = servicios.find((s) => s.id === servicioElegidoId);
    if (!servicio) return;
    const proximaFecha = calcularProximaFechaPorFrecuencia(fechaHoyISO(), servicio.frecuencia);
    onChange({
      descripcion: servicio.nombre,
      frecuencia: servicio.frecuencia,
      valor: servicio.valor,
      resumen: servicio.nombre,
      proximaFecha,
      numCuotas: 1,
      cuotas: [{ fecha: proximaFecha, valor: servicio.valor }],
    });
    setServicioElegidoId("");
  };

  // Calcula la fecha de cada cuota siguiente a partir de la primera,
  // encadenando la frecuencia — la misma cuenta que ya usa el resto de la
  // app para "próximo pago", solo que aquí se muestra completa de una vez
  // en vez de una fecha a la vez.
  const generarCuotas = (base) => {
    const numCuotas = base.frecuencia === "Pago único" ? 1 : Number(base.numCuotas) || 1;
    const cuotas = [];
    let fecha = base.proximaFecha || "";
    for (let i = 0; i < numCuotas; i++) {
      cuotas.push({ fecha, valor: base.valor || 0 });
      if (fecha && base.frecuencia && base.frecuencia !== "Pago único" && base.frecuencia !== "Otro") {
        fecha = calcularProximaFechaPorFrecuencia(fecha, base.frecuencia);
      }
    }
    return cuotas;
  };

  // Cada campo se guarda apenas se edita (nada de un botón "Organizar" aparte
  // que haya que recordar pulsar) — y el resumen se arma solo, en vez de
  // pedírselo a un modelo, así que siempre coincide con lo que hay en los
  // campos. Cambiar valor, frecuencia, número de cuotas o la fecha de la
  // primera vuelve a generar todo el calendario de cuotas; editar una cuota
  // puntual más abajo (actualizarCuota) solo toca esa, sin recalcular las
  // demás.
  const actualizar = (campos) => {
    const combinado = { ...plan, ...campos };
    // combinado.numCuotas se guarda TAL CUAL se escribió (puede quedar en ""
    // un instante mientras se borra para escribir otro número) — solo se
    // redondea a un mínimo de 1 aquí, para generar el calendario y el
    // resumen, sin pisar lo que la persona todavía está escribiendo en el
    // campo. Si se sobrescribiera con el valor ya corregido, el campo
    // "saltaba" de vuelta a 1 apenas se intentaba borrar para cambiarlo.
    const numCuotasEfectivo = combinado.frecuencia === "Pago único" ? 1 : Math.max(1, Number(combinado.numCuotas) || 1);
    const cuotasTexto = numCuotasEfectivo > 1 ? ` en ${numCuotasEfectivo} cuotas` : "";
    const resumen = combinado.valor
      ? `${formatoCOP(combinado.valor)} ${(combinado.frecuencia || "").toLowerCase()}${cuotasTexto}`.trim()
      : "";
    const cuotas = generarCuotas({ ...combinado, numCuotas: numCuotasEfectivo });
    onChange({ ...combinado, cuotas, descripcion: resumen, resumen });
  };

  const actualizarCuota = (idx, campo, valor) => {
    const cuotas = (plan.cuotas || []).map((c, i) => (i === idx ? { ...c, [campo]: valor } : c));
    onChange({ ...plan, cuotas });
  };

  return (
    <div style={{ background: COLORS.surfaceSoft, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 14 }}>
      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, fontWeight: 600, color: COLORS.navy, marginBottom: 8, textAlign: "left" }}>
        ¿Cómo paga este cliente?
      </p>
      {servicios.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Field label="O activa un servicio ya definido (ej: solo vigilancia judicial)">
            <select className="drx-input" style={{ ...inputStyle, fontSize: 12.5, padding: "7px 8px", minWidth: 220 }} value={servicioElegidoId} onChange={(e) => setServicioElegidoId(e.target.value)}>
              <option value="">Elige un servicio…</option>
              {servicios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre} — {formatoCOP(s.valor)} / {s.frecuencia}
                </option>
              ))}
            </select>
          </Field>
          <button className="drx-btn-ghost" style={{ ...buttonGhost, padding: "8px 14px", fontSize: 12.5 }} onClick={usarServicio} disabled={!servicioElegidoId}>
            Usar este servicio
          </button>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, textAlign: "left" }}>
        <Field label="Valor por cuota (COP)">
          <CampoDinero
            style={{ ...inputStyle, fontSize: 12.5, padding: "7px 8px" }}
            value={plan.valor || ""}
            onChange={(e) => actualizar({ valor: Number(e.target.value) })}
            placeholder="Ej: 500.000"
          />
        </Field>
        <Field label="Frecuencia">
          <select
            className="drx-input"
            style={{ ...inputStyle, fontSize: 12.5, padding: "7px 8px" }}
            value={plan.frecuencia || FRECUENCIAS_PAGO[2]}
            onChange={(e) => actualizar({ frecuencia: e.target.value })}
          >
            {FRECUENCIAS_PAGO.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </Field>
        {plan.frecuencia !== "Pago único" && (
          <Field label="Número de cuotas">
            <input
              type="number"
              min="1"
              className="drx-input"
              style={{ ...inputStyle, fontSize: 12.5, padding: "7px 8px" }}
              value={plan.numCuotas === undefined || plan.numCuotas === null ? 1 : plan.numCuotas}
              onChange={(e) => actualizar({ numCuotas: e.target.value })}
            />
          </Field>
        )}
        <Field label={plan.frecuencia === "Pago único" ? "Fecha de pago" : "Fecha de la primera cuota"}>
          <input
            type="date"
            className="drx-input"
            style={{ ...inputStyle, fontSize: 12.5, padding: "7px 8px" }}
            value={plan.proximaFecha || ""}
            onChange={(e) => actualizar({ proximaFecha: e.target.value })}
          />
        </Field>
      </div>
      {plan.cuotas?.length > 1 && (
        <div style={{ marginTop: 12, borderTop: `1px solid ${COLORS.border}`, paddingTop: 12, textAlign: "left" }}>
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, fontWeight: 600, color: COLORS.inkSoft, marginBottom: 8 }}>
            Calendario de cuotas — ajusta la fecha o el valor de una en particular si no es igual a las demás
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {plan.cuotas.map((c, idx) => (
              <div key={idx} className="drx-grid-form" style={{ display: "grid", gridTemplateColumns: "70px 1fr 1fr", gap: 8, alignItems: "center" }}>
                <span style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted }}>Cuota {idx + 1}</span>
                <input
                  type="date"
                  className="drx-input"
                  style={{ ...inputStyle, padding: "7px 9px", fontSize: 12.5 }}
                  value={c.fecha || ""}
                  onChange={(e) => actualizarCuota(idx, "fecha", e.target.value)}
                />
                <CampoDinero
                  style={{ ...inputStyle, padding: "7px 9px", fontSize: 12.5 }}
                  value={c.valor || ""}
                  onChange={(e) => actualizarCuota(idx, "valor", Number(e.target.value))}
                />
              </div>
            ))}
          </div>
        </div>
      )}
      {plan.resumen && (
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.inkSoft, marginTop: 10, fontStyle: "italic", textAlign: "left" }}>"{plan.resumen}"</p>
      )}
    </div>
  );
}

export default function ClientesTab({ usuarioActual, onIrARegistrarPago }) {
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
  // Si cierran la pestaña (o la app) a medio llenar el formulario de un
  // cliente nuevo, sin esto ese trabajo se perdía por completo. Se guarda
  // solo, cada vez que hay algo escrito, y al volver a entrar se ofrece
  // continuarlo o descartarlo — no se carga automático para no pisar sin
  // avisar un formulario en blanco que el usuario abrió a propósito.
  const [borradorDisponible, setBorradorDisponible] = useState(null);
  useEffect(() => {
    const guardado = leerJSONLocal(LLAVE_BORRADOR_CLIENTE, null);
    if (guardado?.nombre?.trim()) setBorradorDisponible(guardado);
  }, []);
  useEffect(() => {
    if (showForm && form.nombre.trim()) guardarJSONLocal(LLAVE_BORRADOR_CLIENTE, form);
  }, [form, showForm]);
  const [soloSinRadicado, setSoloSinRadicado] = useState(false);
  const [soloInactivos, setSoloInactivos] = useState(false);
  const [toastGuardado, setToastGuardado] = useState("");
  const { confirmar, ConfirmarDialogo } = useConfirmarDialogo();

  useEffect(() => {
    (async () => {
      const entries = await obtenerClientesPorId(ids);
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
    // Se empezó a llenar el plan de pago (hay un valor) pero falta la fecha
    // — sin esto, el cliente se guardaba con un valor puesto pero sin
    // próximo cobro programado, y nadie se daba cuenta hasta que el cobro
    // nunca llegó.
    if (form.planPago?.valor && !form.planPago?.proximaFecha) {
      const seguir = await confirmar(
        `Le pusiste un valor al plan de pago de ${form.nombre || "el cliente"} pero falta la fecha. Si guardas así, el cliente va a quedar sin próximo cobro programado. ¿Guardar de todas formas?`
      );
      if (!seguir) return;
    }
    const id = uid();
    const proximoPago = form.planPago?.proximaFecha ? { fecha: form.planPago.proximaFecha, valorEsperado: form.planPago.valor } : null;
    // "radicado" (el primero) se mantiene además de "radicados" (la lista
    // completa) para que todo el código viejo que solo conoce "radicado"
    // (el portal del cliente, el asistente de IA, etc.) siga funcionando
    // igual sin tener que tocarlo.
    const radicados = (form.radicados || []).map((r) => r.trim()).filter(Boolean);
    await storageSet(
      `cliente:${id}`,
      JSON.stringify({ ...form, radicados, radicado: radicados[0] || "", timeline: [], ultimaActuacion: new Date().toISOString(), proximoPago }),
      false
    );
    await addId(id);
    registrarAuditoria(usuarioActual, "crear_cliente", "cliente", id, { nombre: form.nombre });
    setToastGuardado(
      proximoPago
        ? `"${form.nombre}" se guardó correctamente`
        : `"${form.nombre}" se guardó correctamente. Cuando pague, ve a Contabilidad para registrar el pago.`
    );
    setTimeout(() => setToastGuardado(""), 4200);
    guardarJSONLocal(LLAVE_BORRADOR_CLIENTE, null);
    setBorradorDisponible(null);
    setForm(FORM_CLIENTE_INICIAL);
    setShowForm(false);
  };

  const continuarBorrador = () => {
    setForm(borradorDisponible);
    setShowForm(true);
    setBorradorDisponible(null);
  };

  const descartarBorrador = () => {
    guardarJSONLocal(LLAVE_BORRADOR_CLIENTE, null);
    setBorradorDisponible(null);
  };

  const empezarEdicion = (id) => {
    setEditandoId(id);
    // Los clientes creados antes de que existiera "radicados" solo tienen
    // "radicado" (un único valor) — radicadosDeCliente lo convierte en una
    // lista de un elemento para que el editor de radicados tenga algo con
    // qué trabajar sin importar cuándo se creó el cliente.
    setFormEdicion({ ...clientes[id], radicados: radicadosDeCliente(clientes[id]) });
  };

  const guardarEdicion = async (id) => {
    if (!formEdicion.nombre?.trim()) return;
    const proximoPago = formEdicion.planPago?.proximaFecha
      ? { fecha: formEdicion.planPago.proximaFecha, valorEsperado: formEdicion.planPago.valor }
      : formEdicion.proximoPago || null;
    if (formEdicion.planPago?.valor && !formEdicion.planPago?.proximaFecha && !proximoPago) {
      const seguir = await confirmar(
        `Le pusiste un valor al plan de pago de ${formEdicion.nombre || "el cliente"} pero falta la fecha. Si guardas así, va a quedar sin próximo cobro programado. ¿Guardar de todas formas?`
      );
      if (!seguir) return;
    }
    const radicados = (formEdicion.radicados || []).map((r) => r.trim()).filter(Boolean);
    const actualizado = { ...formEdicion, radicados, radicado: radicados[0] || "", proximoPago };
    await storageSet(`cliente:${id}`, JSON.stringify(actualizado), false);
    setClientes((prev) => ({ ...prev, [id]: actualizado }));
    setEditandoId(null);
  };

  const agregarActuacion = async (id, nota, fecha) => {
    const c = clientes[id];
    // "fecha" es la del hecho (puede ser de días atrás, cuando se registra
    // tarde una audiencia ya pasada) — no la de hoy, que es cuándo se está
    // escribiendo la nota. Si no llega (p. ej. desde el asistente de IA),
    // se usa hoy como antes.
    const fechaISO = fecha ? new Date(`${fecha}T12:00:00`).toISOString() : new Date().toISOString();
    const nuevaEntrada = { id: uid(), fecha: fechaISO, nota };
    const actualizado = { ...c, timeline: [...(c.timeline || []), nuevaEntrada], ultimaActuacion: new Date().toISOString() };
    await storageSet(`cliente:${id}`, JSON.stringify(actualizado), false);
    setClientes((prev) => ({ ...prev, [id]: actualizado }));
  };

  // Deja corregir la fecha de una actuación ya registrada (p. ej. si se
  // guardó con la fecha de hoy en vez de la fecha real del hecho) sin tener
  // que borrarla y volver a escribirla.
  const editarFechaActuacion = async (id, entradaId, fecha) => {
    const c = clientes[id];
    const fechaISO = new Date(`${fecha}T12:00:00`).toISOString();
    const timeline = (c.timeline || []).map((t) => (t.id === entradaId ? { ...t, fecha: fechaISO } : t));
    const actualizado = { ...c, timeline };
    await storageSet(`cliente:${id}`, JSON.stringify(actualizado), false);
    setClientes((prev) => ({ ...prev, [id]: actualizado }));
  };

  const editarNotaActuacion = async (id, entradaId, nota) => {
    const c = clientes[id];
    const timeline = (c.timeline || []).map((t) => (t.id === entradaId ? { ...t, nota } : t));
    const actualizado = { ...c, timeline };
    await storageSet(`cliente:${id}`, JSON.stringify(actualizado), false);
    setClientes((prev) => ({ ...prev, [id]: actualizado }));
  };

  const eliminarActuacion = async (id, entradaId) => {
    const c = clientes[id];
    const timeline = (c.timeline || []).filter((t) => t.id !== entradaId);
    const actualizado = { ...c, timeline };
    await storageSet(`cliente:${id}`, JSON.stringify(actualizado), false);
    setClientes((prev) => ({ ...prev, [id]: actualizado }));
  };

  // Vuelve a agregar exactamente la misma entrada (mismo id, fecha y nota)
  // que se acaba de eliminar — es lo que usa el botón "Deshacer".
  const restaurarActuacion = async (id, entrada) => {
    const c = clientes[id];
    const actualizado = { ...c, timeline: [...(c.timeline || []), entrada] };
    await storageSet(`cliente:${id}`, JSON.stringify(actualizado), false);
    setClientes((prev) => ({ ...prev, [id]: actualizado }));
  };

  // Pausar un proceso: el caso sigue existiendo pero deja de contar como
  // "inactivo" o de generar avisos de pago atrasado/pendiente mientras está
  // en pausa — útil cuando el proceso está detenido por algo externo (a la
  // espera de un trámite, el cliente pidió un receso, etc.) y no tiene
  // sentido que el sistema siga insistiendo con recordatorios.
  const pausarProceso = async (id) => {
    const c = clientes[id];
    const actualizado = { ...c, procesoPausado: !c.procesoPausado };
    await storageSet(`cliente:${id}`, JSON.stringify(actualizado), false);
    setClientes((prev) => ({ ...prev, [id]: actualizado }));
    registrarAuditoria(usuarioActual, actualizado.procesoPausado ? "pausar_proceso" : "reanudar_proceso", "cliente", id, { nombre: c.nombre });
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
            radicadosDeCliente(c).some((r) => r.toLowerCase().includes(textoFiltro)) ||
            c.telefono?.toLowerCase().includes(textoFiltro)
          );
        })
      : idsOrdenados;
    if (soloSinRadicado) resultado = resultado.filter((id) => radicadosDeCliente(clientes[id]).length === 0);
    if (soloInactivos) {
      resultado = resultado.filter((id) => {
        const dias = diasDesde(clientes[id]?.ultimaActuacion);
        return dias !== null && dias >= DIAS_ALERTA_INACTIVIDAD && !clientes[id]?.procesoPausado;
      });
    }
    return resultado;
  }, [ids, clientes, orden, filtro, soloSinRadicado, soloInactivos]);

  return (
    <div>
      <EncabezadoSeccion titulo="Clientes" color="#14B8A6" />
      {borradorDisponible && (
        <div
          className="drx-fade-in"
          style={{
            display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap",
            background: "#FEF3E2", border: "1px solid #FCE3B8", borderRadius: 10, padding: "12px 16px", marginBottom: 14,
          }}
        >
          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: "#92400E", margin: 0 }}>
            <Icono tipo="alerta" size={13} style={{ marginRight: 5, verticalAlign: -2 }} />
            Tienes un cliente sin terminar de guardar: <strong>"{borradorDisponible.nombre}"</strong>.
          </p>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button className="drx-btn-primary" style={{ ...buttonPrimary, padding: "6px 14px", fontSize: 12.5 }} onClick={continuarBorrador}>
              Continuar
            </button>
            <button className="drx-btn-ghost" style={{ ...buttonGhost, padding: "6px 14px", fontSize: 12.5 }} onClick={descartarBorrador}>
              Descartar
            </button>
          </div>
        </div>
      )}
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
                  { titulo: "Radicado(s)", valor: (id) => radicadosDeCliente(clientes[id]).join(" / ") },
                  { titulo: "Tipo de proceso", valor: (id) => clientes[id]?.tipoProceso },
                  { titulo: "Área", valor: (id) => clientes[id]?.areaProceso },
                  { titulo: "Valor total acordado", valor: (id) => clientes[id]?.valorTotal },
                  { titulo: "Notas", valor: (id) => clientes[id]?.notas },
                  { titulo: "Paga (si es distinto al cliente)", valor: (id) => clientes[id]?.pagador?.nombre || "" },
                ],
                idsOrdenados
              )
            }
          >
            Exportar Excel
          </button>
          <button
            className="drx-btn-primary drx-cta-shine"
            style={buttonPrimary}
            onClick={() => {
              // Si abren el formulario a mano (no con "Continuar" del aviso
              // de borrador), se oculta ese aviso — si no, seguiría
              // ofreciendo "Continuar" con datos viejos mientras ya están
              // escribiendo uno nuevo encima.
              setBorradorDisponible(null);
              setShowForm((s) => !s);
            }}
          >
            {showForm ? "Cancelar" : "+ Nuevo cliente"}
          </button>
        </div>
      </div>

      {showForm && (
        <Card style={{ marginBottom: 16 }}>
          <div className="drx-grid-form" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Nombre principal (contacto)">
              <input className="drx-input" style={inputStyle} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value.toUpperCase() })} />
            </Field>
            <Field label="Teléfono">
              <input className="drx-input" style={inputStyle} value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
            </Field>
            <Field label="Correo">
              <input className="drx-input" style={inputStyle} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Número(s) de radicado (opcional)">
              <EditorRadicados radicados={form.radicados} onChange={(radicados) => setForm({ ...form, radicados })} />
            </Field>
            <Field label="Área del proceso">
              <select
                className="drx-input"
                style={inputStyle}
                value={form.areaProceso}
                onChange={(e) => {
                  const areaProceso = e.target.value;
                  setForm({ ...form, areaProceso, tipoProceso: tiposProcesoDeArea(areaProceso)[0] });
                }}
              >
                {AREAS_PROCESO.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tipo de proceso">
              <select className="drx-input" style={inputStyle} value={form.tipoProceso} onChange={(e) => setForm({ ...form, tipoProceso: e.target.value })}>
                {tiposProcesoDeArea(form.areaProceso).map((t) => (
                  <option key={t} value={t}>
                    {t}
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
          <SelectorPagador pagador={form.pagador} onChange={(pagador) => setForm({ ...form, pagador })} />
          <PlanDePago planPago={form.planPago} onChange={(planPago) => setForm({ ...form, planPago })} />
          <SelectorComision
            titulo="¿Alguien refirió a este cliente? (comisión)"
            contactosHook={useReferenciadores}
            valor={form.referenciador}
            onChange={(referenciador) => setForm({ ...form, referenciador })}
            placeholderNombre="Nombre de quien refiere"
          />
          <SelectorComision
            titulo="¿Se trabaja este caso con otro abogado? (honorarios compartidos)"
            contactosHook={useAbogadosAsociados}
            valor={form.abogadoAsociado}
            onChange={(abogadoAsociado) => setForm({ ...form, abogadoAsociado })}
            placeholderNombre="Nombre del abogado"
          />
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
                    <input className="drx-input" style={inputStyle} value={formEdicion.nombre || ""} onChange={(e) => setFormEdicion({ ...formEdicion, nombre: e.target.value.toUpperCase() })} />
                  </Field>
                  <Field label="Teléfono">
                    <input className="drx-input" style={inputStyle} value={formEdicion.telefono || ""} onChange={(e) => setFormEdicion({ ...formEdicion, telefono: e.target.value })} />
                  </Field>
                  <Field label="Correo">
                    <input className="drx-input" style={inputStyle} value={formEdicion.email || ""} onChange={(e) => setFormEdicion({ ...formEdicion, email: e.target.value })} />
                  </Field>
                  <Field label="Número(s) de radicado (opcional)">
                    <EditorRadicados radicados={formEdicion.radicados} onChange={(radicados) => setFormEdicion({ ...formEdicion, radicados })} />
                  </Field>
                  <Field label="Área del proceso">
                    <select
                      className="drx-input"
                      style={inputStyle}
                      value={formEdicion.areaProceso || AREAS_PROCESO[0]}
                      onChange={(e) => {
                        const areaProceso = e.target.value;
                        setFormEdicion({ ...formEdicion, areaProceso, tipoProceso: tiposProcesoDeArea(areaProceso)[0] });
                      }}
                    >
                      {AREAS_PROCESO.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Tipo de proceso">
                    {(() => {
                      // Un cliente creado antes de que el tipo dependiera del
                      // área puede tener guardado un tipo que ya no aparece
                      // en la lista de su área actual — se incluye igual para
                      // no cambiarle el dato sin que el usuario lo pida.
                      const opciones = tiposProcesoDeArea(formEdicion.areaProceso || AREAS_PROCESO[0]);
                      const valorActual = formEdicion.tipoProceso || opciones[0];
                      const listaCompleta = opciones.includes(valorActual) ? opciones : [valorActual, ...opciones];
                      return (
                        <select className="drx-input" style={inputStyle} value={valorActual} onChange={(e) => setFormEdicion({ ...formEdicion, tipoProceso: e.target.value })}>
                          {listaCompleta.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      );
                    })()}
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
                <SelectorPagador pagador={formEdicion.pagador} onChange={(pagador) => setFormEdicion({ ...formEdicion, pagador })} />
                <PlanDePago planPago={formEdicion.planPago} onChange={(planPago) => setFormEdicion({ ...formEdicion, planPago })} />
                <SelectorComision
                  titulo="¿Alguien refirió a este cliente? (comisión)"
                  contactosHook={useReferenciadores}
                  valor={formEdicion.referenciador}
                  onChange={(referenciador) => setFormEdicion({ ...formEdicion, referenciador })}
                  placeholderNombre="Nombre de quien refiere"
                />
                <SelectorComision
                  titulo="¿Se trabaja este caso con otro abogado? (honorarios compartidos)"
                  contactosHook={useAbogadosAsociados}
                  valor={formEdicion.abogadoAsociado}
                  onChange={(abogadoAsociado) => setFormEdicion({ ...formEdicion, abogadoAsociado })}
                  placeholderNombre="Nombre del abogado"
                />
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
          const inactivo = dias !== null && dias >= DIAS_ALERTA_INACTIVIDAD && !c.procesoPausado;

          return (
            <Card key={id} style={{ borderLeft: `4px solid ${COLOR_AREA_PROCESO[c.areaProceso] || "#14B8A6"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 260, display: "flex", gap: 12 }}>
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
                    {radicadosDeCliente(c).map((r, idx) => (
                      <span
                        key={r}
                        className="drx-pastilla-radicado"
                        style={{
                          display: "inline-flex",
                          alignItems: "stretch",
                          flexShrink: 0,
                          borderRadius: 10,
                          border: `1px solid ${copiado === `rad-${id}-${idx}` ? "#B7D9C4" : COLORS.border}`,
                          overflow: "hidden",
                          boxShadow: "0 1px 2px rgba(16,24,40,0.04)",
                        }}
                      >
                        <button
                          type="button"
                          title="Copiar radicado (para pegarlo en Rama Judicial o en la Fiscalía)"
                          onClick={() => copiar(r, `rad-${id}-${idx}`)}
                          style={{
                            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                            fontSize: 11.5,
                            letterSpacing: 0.2,
                            whiteSpace: "nowrap",
                            padding: "6px 12px",
                            background: copiado === `rad-${id}-${idx}` ? "#E4EEE2" : COLORS.surfaceSoft,
                            color: copiado === `rad-${id}-${idx}` ? "#1F6B3A" : COLORS.inkSoft,
                            cursor: "pointer",
                            border: "none",
                            display: "flex",
                            alignItems: "center",
                            gap: 7,
                          }}
                        >
                          {copiado === `rad-${id}-${idx}` ? (
                            "✓ Copiado"
                          ) : (
                            <>
                              <span style={{ color: COLORS.muted, fontFamily: "Inter, sans-serif", fontWeight: 600, fontSize: 10.5 }}>RADICADO</span>
                              {r}
                              <Icono tipo="portapapeles" size={11} />
                            </>
                          )}
                        </button>
                        <a
                          href="https://consultaprocesos.ramajudicial.gov.co/procesos"
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            fontFamily: "Inter, sans-serif",
                            fontSize: 11,
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                            padding: "6px 12px",
                            background: "#EEF6EF",
                            color: "#1F6B3A",
                            textDecoration: "none",
                            borderLeft: `1px solid ${COLORS.border}`,
                            display: "flex",
                            alignItems: "center",
                          }}
                        >
                          Rama ↗
                        </a>
                        {c.areaProceso === "Penal" && (
                          <a
                            href={URL_CONSULTA_SPOA}
                            target="_blank"
                            rel="noreferrer"
                            title="Abre la consulta pública de la Fiscalía — hay que resolver el captcha a mano, no se puede automatizar"
                            style={{
                              fontFamily: "Inter, sans-serif",
                              fontSize: 11,
                              fontWeight: 700,
                              whiteSpace: "nowrap",
                              padding: "6px 12px",
                              background: "#FEF2F2",
                              color: "#B91C1C",
                              textDecoration: "none",
                              borderLeft: `1px solid ${COLORS.border}`,
                              display: "flex",
                              alignItems: "center",
                            }}
                          >
                            Fiscalía ↗
                          </a>
                        )}
                      </span>
                    ))}
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
                    {c.procesoPausado && (
                      <span
                        style={{
                          fontFamily: "Inter, sans-serif",
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "3px 9px",
                          borderRadius: 20,
                          background: "#F1F0FF",
                          color: "#5B21B6",
                          border: "1px solid #DCD6FF",
                        }}
                      >
                        En pausa
                      </span>
                    )}
                  </div>
                  {c.pagador?.nombre && (
                    <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.inkSoft, margin: "8px 0 0" }}>
                      <Icono tipo="tarjeta" size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
                      Paga: <strong>{c.pagador.nombre}</strong>
                      {c.pagador.telefono ? ` · ${c.pagador.telefono}` : ""}
                    </p>
                  )}
                  {c.referenciador?.nombre && (
                    <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.inkSoft, margin: "4px 0 0" }}>
                      <Icono tipo="persona" size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
                      Refirió: <strong>{c.referenciador.nombre}</strong>
                      {c.referenciador.porcentaje ? ` · ${c.referenciador.porcentaje}% comisión` : ""}
                    </p>
                  )}
                  {c.abogadoAsociado?.nombre && (
                    <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.inkSoft, margin: "4px 0 0" }}>
                      <Icono tipo="balanza" size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
                      Con: <strong>{c.abogadoAsociado.nombre}</strong>
                      {c.abogadoAsociado.porcentaje ? ` · ${c.abogadoAsociado.porcentaje}% honorarios` : ""}
                    </p>
                  )}
                  {c.notas && <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.inkSoft, margin: "8px 0 0" }}>{c.notas}</p>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
                  <button
                    className="drx-btn-ghost"
                    style={{ ...buttonGhost, background: "#1DA851", color: "#FFFFFF", border: "none" }}
                    onClick={() => {
                      const numero = numeroWhatsappCliente(c.telefono);
                      // Sin emojis a propósito: los de secuencia compuesta
                      // (como los números con recuadro 1️⃣2️⃣) no se ven bien
                      // en todos los WhatsApp/dispositivos y salían como
                      // "�" — con texto plano se ve más serio para un
                      // mensaje de despacho de abogados, y no depende de que
                      // el teléfono de cada cliente tenga esas fuentes.
                      const mensaje = `*${getNombreDespacho()}*\n\nHola ${c.nombre || ""}, te compartimos acceso a tu portal personal. Ahí puedes consultar el estado de tu proceso y tu estado de cuenta cuando quieras.\n\nIngresa aquí: ${window.location.origin}/#portal\nCódigo de acceso: *${id}*`;
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
                      const radicados = radicadosDeCliente(c);
                      const datos = [
                        c.nombre,
                        c.telefono ? `Tel: ${c.telefono}` : null,
                        c.email ? `Correo: ${c.email}` : null,
                        radicados.length > 0 ? `Radicado${radicados.length > 1 ? "s" : ""}: ${radicados.join(", ")}` : null,
                      ]
                        .filter(Boolean)
                        .join("\n");
                      copiar(datos, `todo-${id}`);
                    }}
                  >
                    {copiado === `todo-${id}` ? "✓ Copiado" : "Copiar datos"}
                  </button>
                  {onIrARegistrarPago && (
                    <button
                      className="drx-btn-ghost"
                      style={{ ...buttonGhost, color: "#F43F5E", borderColor: "#FBD5DC" }}
                      title="Ir a Contabilidad a registrar un pago de este cliente"
                      onClick={() => onIrARegistrarPago(id)}
                    >
                      Registrar pago ↗
                    </button>
                  )}
                  <button
                    className="drx-btn-ghost"
                    style={{ ...buttonGhost, ...(c.procesoPausado ? { background: "#FEF3E2", color: "#B45309", borderColor: "#FCE3B8" } : {}) }}
                    title={c.procesoPausado ? "Reanudar seguimiento de avisos e inactividad" : "Pausar avisos de inactividad y de pago mientras el proceso está detenido"}
                    onClick={() => pausarProceso(id)}
                  >
                    {c.procesoPausado ? "Reanudar proceso" : "Pausar proceso"}
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
              <LineaDeTiempo
                cliente={c}
                onAgregar={(nota, fecha) => agregarActuacion(id, nota, fecha)}
                onEditarFecha={(entradaId, fecha) => editarFechaActuacion(id, entradaId, fecha)}
                onEditarNota={(entradaId, nota) => editarNotaActuacion(id, entradaId, nota)}
                onEliminar={(entradaId) => eliminarActuacion(id, entradaId)}
                onRestaurar={(entrada) => restaurarActuacion(id, entrada)}
                confirmar={confirmar}
              />
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
