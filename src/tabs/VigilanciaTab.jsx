import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import { storageGet, storageSet } from "../lib/storage";
import {
  COLORS, uid, diasDesde, useIndex, useConfirmarDialogo, inputStyle, buttonPrimary, buttonGhost, Card,
  EncabezadoSeccion, Icono, AvatarIniciales, EstadoVacio, LineaDeTiempo, COLOR_AREA_PROCESO,
  ESTADOS_VIGILANCIA, consultarRamaJudicial, radicadosDeCliente,
} from "../App.jsx";

// El estado de "última consulta" de un radicado vive en dos lugares por
// compatibilidad: "ramaJudicial" (el de siempre, un solo radicado, para
// clientes creados antes de que existiera la lista) y
// "ramaJudicialPorRadicado" (uno por cada radicado de la lista). Esta
// función busca en el lugar correcto según cuál de los dos aplica.
// No se puede automatizar esta consulta: el propio portal de la Fiscalía
// exige un reCAPTCHA en cada búsqueda para impedir consultas masivas o por
// robot — así que esto es un acceso directo para que el abogado la haga a
// mano en un clic, no una consulta automática como la de la Rama Judicial.
const URL_CONSULTA_SPOA = "https://www.fiscalia.gov.co/servicios-de-informacion-al-ciudadano/consultas/";

function estadoRamaPorRadicado(cliente, radicado) {
  const porRadicado = cliente?.ramaJudicialPorRadicado || {};
  if (porRadicado[radicado]) return porRadicado[radicado];
  const esPrimario = radicadosDeCliente(cliente)[0] === radicado;
  return esPrimario ? cliente?.ramaJudicial || null : null;
}

async function explicarActuacion(actuacion, anotacion) {
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
      // 300 se quedaba corto y la respuesta salía cortada a la mitad — el
      // modelo que usa /api/assistant "piensa" antes de responder, y ese
      // pensamiento interno también consume el límite de tokens aunque no
      // se vea, dejando poco espacio real para el texto visible.
      max_tokens: 800,
      system:
        `Eres un asistente para un abogado colombiano. Te doy el nombre de una actuación judicial y su anotación tal como aparecen en la Rama Judicial. ` +
        `Responde en máximo 3 frases cortas, en español sencillo (sin tecnicismos innecesarios): primero explica qué significa esta actuación en términos prácticos, ` +
        `y luego sugiere la acción concreta que el abogado debería tomar a continuación (ej: "presentar memorial", "impulsar el proceso", "esperar el vencimiento del término", "notificar al cliente", etc.). ` +
        `No agregues introducciones ni despedidas, ve directo a la explicación y la sugerencia.`,
      messages: [{ role: "user", content: `Actuación: ${actuacion}\nAnotación: ${anotacion || "(sin anotación)"}` }],
    }),
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || "No se pudo contactar al asistente de IA");
  const texto = (data.content || []).map((b) => b.text || "").join("").trim();
  return data.truncado ? `${texto}\n\n(La respuesta se cortó por límite de espacio — vuelve a intentar si falta algo importante.)` : texto;
}

export default function VigilanciaTab() {
  const { ids } = useIndex("indice-clientes", false);
  const [clientes, setClientes] = useState({});
  const [consultando, setConsultando] = useState(null);
  const [resultados, setResultados] = useState({});
  const [errores, setErrores] = useState({});
  const [consultandoTodos, setConsultandoTodos] = useState(false);
  const [explicaciones, setExplicaciones] = useState({});
  const [explicando, setExplicando] = useState(null);
  const [filtroEstado, setFiltroEstado] = useState("Todos");
  const [radicadoCopiado, setRadicadoCopiado] = useState("");
  const [explicacionCopiada, setExplicacionCopiada] = useState("");
  const { confirmar, ConfirmarDialogo } = useConfirmarDialogo();

  const copiarRadicado = (radicado, id) => {
    navigator.clipboard?.writeText(radicado);
    setRadicadoCopiado(id);
    setTimeout(() => setRadicadoCopiado(""), 1500);
  };

  const copiarExplicacion = (texto, id) => {
    navigator.clipboard?.writeText(texto);
    setExplicacionCopiada(id);
    setTimeout(() => setExplicacionCopiada(""), 1500);
  };

  const cargar = useCallback(async () => {
    const entries = {};
    for (const id of ids) {
      const raw = await storageGet(`cliente:${id}`, false);
      if (raw) entries[id] = JSON.parse(raw);
    }
    setClientes(entries);
  }, [ids]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cambiarEstadoVigilancia = async (id, estado) => {
    const c = clientes[id];
    const actualizado = { ...c, estadoVigilancia: estado };
    await storageSet(`cliente:${id}`, JSON.stringify(actualizado), false);
    setClientes((prev) => ({ ...prev, [id]: actualizado }));
  };

  const agregarNovedad = async (id, nota, fecha) => {
    const c = clientes[id];
    const fechaISO = fecha ? new Date(`${fecha}T12:00:00`).toISOString() : new Date().toISOString();
    const nuevaEntrada = { id: uid(), fecha: fechaISO, nota };
    const actualizado = { ...c, timeline: [...(c.timeline || []), nuevaEntrada], ultimaActuacion: new Date().toISOString() };
    await storageSet(`cliente:${id}`, JSON.stringify(actualizado), false);
    setClientes((prev) => ({ ...prev, [id]: actualizado }));
    return actualizado;
  };

  const editarFechaNovedad = async (id, entradaId, fecha) => {
    const c = clientes[id];
    const fechaISO = new Date(`${fecha}T12:00:00`).toISOString();
    const timeline = (c.timeline || []).map((t) => (t.id === entradaId ? { ...t, fecha: fechaISO } : t));
    const actualizado = { ...c, timeline };
    await storageSet(`cliente:${id}`, JSON.stringify(actualizado), false);
    setClientes((prev) => ({ ...prev, [id]: actualizado }));
  };

  const editarNotaNovedad = async (id, entradaId, nota) => {
    const c = clientes[id];
    const timeline = (c.timeline || []).map((t) => (t.id === entradaId ? { ...t, nota } : t));
    const actualizado = { ...c, timeline };
    await storageSet(`cliente:${id}`, JSON.stringify(actualizado), false);
    setClientes((prev) => ({ ...prev, [id]: actualizado }));
  };

  const eliminarNovedad = async (id, entradaId) => {
    const c = clientes[id];
    const timeline = (c.timeline || []).filter((t) => t.id !== entradaId);
    const actualizado = { ...c, timeline };
    await storageSet(`cliente:${id}`, JSON.stringify(actualizado), false);
    setClientes((prev) => ({ ...prev, [id]: actualizado }));
  };

  // Vuelve a agregar exactamente la misma entrada (mismo id, fecha y nota)
  // que se acaba de eliminar — es lo que usa el botón "Deshacer".
  const restaurarNovedad = async (id, entrada) => {
    const c = clientes[id];
    const actualizado = { ...c, timeline: [...(c.timeline || []), entrada] };
    await storageSet(`cliente:${id}`, JSON.stringify(actualizado), false);
    setClientes((prev) => ({ ...prev, [id]: actualizado }));
  };

  // Consulta un radicado puntual de un cliente y solo muestra el resultado
  // (no toca nada todavía) — el abogado decide si lo agrega a la línea de
  // tiempo. Un cliente con varios radicados consulta cada uno por separado
  // (cada uno con su propio botón y resultado en pantalla).
  const consultarUno = async (id, radicado) => {
    const clave = `${id}:${radicado}`;
    setConsultando(clave);
    setErrores((prev) => ({ ...prev, [clave]: null }));
    try {
      const data = await consultarRamaJudicial(radicado);
      setResultados((prev) => ({ ...prev, [clave]: data }));
    } catch (e) {
      setErrores((prev) => ({ ...prev, [clave]: e.message }));
    }
    setConsultando(null);
  };

  // Arma UNA sola actualización combinada (nota nueva + estado de "última
  // consulta" + "Con novedad") y la guarda de una vez — antes esto llamaba
  // por separado a agregarNovedad, guardarComoVista y cambiarEstadoVigilancia,
  // y cada una leía "clientes[id]" del estado de React, que todavía no se
  // había refrescado con lo que acababa de guardar la anterior: la segunda
  // llamada sobrescribía el storage con una copia vieja (sin la nota que se
  // acababa de agregar), por lo que el botón parecía no hacer nada.
  const agregarComoNovedad = async (id, radicado) => {
    const data = resultados[`${id}:${radicado}`];
    if (!data?.ultimaActuacion) return;
    const c = clientes[id];
    // Con varios radicados por cliente, la nota tiene que decir de cuál
    // proceso viene — si no, en la línea de tiempo se mezclan sin poder
    // distinguirlas.
    const texto = `Rama Judicial (radicado ${radicado}, ${data.proceso?.despacho || "despacho no informado"}) — ${data.ultimaActuacion.actuacion || "Actuación"}${
      data.ultimaActuacion.anotacion ? `: ${data.ultimaActuacion.anotacion}` : ""
    }`;
    // La fecha de la entrada es la de la actuación real que reporta la Rama
    // Judicial, no la de hoy — si no, un proceso viejo recién agregado
    // quedaría con toda su línea de tiempo marcada como "hoy".
    const nuevaEntrada = { id: uid(), fecha: data.ultimaActuacion.fecha, nota: texto };
    const entradaEstado = {
      idProceso: data.idProceso,
      despacho: data.proceso?.despacho || null,
      ultimaActuacionVistaFecha: data.ultimaActuacion?.fecha || null,
      consultadoEn: data.consultadoEn,
    };
    const ramaJudicialPorRadicado = { ...(c.ramaJudicialPorRadicado || {}), [radicado]: entradaEstado };
    const esPrimario = radicadosDeCliente(c)[0] === radicado;
    const actualizado = {
      ...c,
      timeline: [...(c.timeline || []), nuevaEntrada],
      ultimaActuacion: new Date().toISOString(),
      estadoVigilancia: "Con novedad",
      ramaJudicialPorRadicado,
      ...(esPrimario ? { ramaJudicial: entradaEstado } : {}),
    };
    await storageSet(`cliente:${id}`, JSON.stringify(actualizado), false);
    setClientes((prev) => ({ ...prev, [id]: actualizado }));
  };

  const pedirExplicacion = async (id, radicado) => {
    const clave = `${id}:${radicado}`;
    const data = resultados[clave];
    if (!data?.ultimaActuacion) return;
    setExplicando(clave);
    try {
      const texto = await explicarActuacion(data.ultimaActuacion.actuacion, data.ultimaActuacion.anotacion);
      setExplicaciones((prev) => ({ ...prev, [clave]: texto || "No pude generar una explicación en este momento." }));
    } catch (e) {
      setExplicaciones((prev) => ({ ...prev, [clave]: "No pude generar una explicación en este momento." }));
    }
    setExplicando(null);
  };

  const conRadicado = ids.filter((id) => radicadosDeCliente(clientes[id]).length > 0);
  const sinRadicado = ids.filter((id) => radicadosDeCliente(clientes[id]).length === 0);
  // Cada radicado se vigila por separado — un cliente con 3 radicados cuenta
  // como hasta 3 procesos aquí, no como 1.
  const paresRadicado = conRadicado.flatMap((id) => radicadosDeCliente(clientes[id]).map((radicado) => ({ id, radicado })));
  const sinRevisarHaceTiempo = paresRadicado.filter(({ id, radicado }) => {
    const estado = estadoRamaPorRadicado(clientes[id], radicado);
    return !estado?.consultadoEn || diasDesde(estado.consultadoEn) >= 15;
  }).length;

  // Prioriza "Con novedad" arriba de todo — son los procesos que realmente
  // necesitan atención hoy — y dentro de cada estado respeta el orden en
  // que ya venían (por ultimaActuacion / creación).
  const ordenEstadoPrioridad = { "Con novedad": 0, "Pendiente de revisión": 1, "En trámite": 2, "Finalizado": 3 };
  const conRadicadoOrdenados = [...conRadicado].sort((a, b) => {
    const pa = ordenEstadoPrioridad[clientes[a]?.estadoVigilancia] ?? 1;
    const pb = ordenEstadoPrioridad[clientes[b]?.estadoVigilancia] ?? 1;
    return pa - pb;
  });
  const conRadicadoFiltrados =
    filtroEstado === "Todos"
      ? conRadicadoOrdenados
      : conRadicadoOrdenados.filter((id) => (clientes[id]?.estadoVigilancia || ESTADOS_VIGILANCIA[0]) === filtroEstado);

  // Consulta TODOS los radicados de TODOS los clientes y marca
  // automáticamente "Con novedad" (y agrega la actuación a la línea de
  // tiempo) solo en los que tengan una actuación más reciente que la
  // última vez que se revisó ESE radicado en particular.
  //
  // Se arma cada actualización en una copia local ("clientesLocales") en
  // vez de leer "clientes[id]" del estado de React en cada vuelta del
  // ciclo — si un mismo cliente tiene 2+ radicados, el estado de React
  // todavía no se habría actualizado con lo del primer radicado cuando le
  // toca el turno al segundo, y se perdería esa novedad al sobreescribir.
  const consultarTodos = async () => {
    setConsultandoTodos(true);
    const clientesLocales = { ...clientes };
    for (const { id, radicado } of paresRadicado) {
      const clave = `${id}:${radicado}`;
      try {
        const data = await consultarRamaJudicial(radicado);
        setResultados((prev) => ({ ...prev, [clave]: data }));
        setErrores((prev) => ({ ...prev, [clave]: null }));
        const c = clientesLocales[id];
        const estadoPrevio = estadoRamaPorRadicado(c, radicado);
        const fechaVista = estadoPrevio?.ultimaActuacionVistaFecha;
        const fechaNueva = data.ultimaActuacion?.fecha;
        const entradaEstado = {
          idProceso: data.idProceso,
          despacho: data.proceso?.despacho || null,
          ultimaActuacionVistaFecha: fechaNueva || null,
          consultadoEn: data.consultadoEn,
        };
        const ramaJudicialPorRadicado = { ...(c.ramaJudicialPorRadicado || {}), [radicado]: entradaEstado };
        const esPrimario = radicadosDeCliente(c)[0] === radicado;
        let actualizado = { ...c, ramaJudicialPorRadicado, ...(esPrimario ? { ramaJudicial: entradaEstado } : {}) };
        if (fechaNueva && (!fechaVista || new Date(fechaNueva) > new Date(fechaVista))) {
          const texto = `Rama Judicial (radicado ${radicado}, ${data.proceso?.despacho || "despacho no informado"}) — ${data.ultimaActuacion.actuacion || "Actuación"}${
            data.ultimaActuacion.anotacion ? `: ${data.ultimaActuacion.anotacion}` : ""
          }`;
          // La fecha de la entrada es la de la actuación real, no la de hoy
          // (cuándo se detectó) — si no, un proceso de hace años quedaría
          // con toda su línea de tiempo marcada como "hoy".
          const nuevaEntrada = { id: uid(), fecha: fechaNueva, nota: texto };
          actualizado = { ...actualizado, timeline: [...(c.timeline || []), nuevaEntrada], ultimaActuacion: new Date().toISOString(), estadoVigilancia: "Con novedad" };
        }
        await storageSet(`cliente:${id}`, JSON.stringify(actualizado), false);
        clientesLocales[id] = actualizado;
      } catch (e) {
        setErrores((prev) => ({ ...prev, [clave]: e.message }));
      }
    }
    setClientes(clientesLocales);
    setConsultandoTodos(false);
  };

  return (
    <div>
      {ConfirmarDialogo}
      <EncabezadoSeccion titulo="Vigilancia judicial" color="#F5A524" />
      <div
        style={{
          background: COLORS.accentSoft,
          border: "1px solid #C7D6EA",
          borderRadius: 10,
          padding: "14px 16px",
          marginBottom: 18,
          fontFamily: "Inter, sans-serif",
          fontSize: 12.5,
          color: COLORS.navy,
          lineHeight: 1.6,
        }}
      >
        <strong><Icono tipo="balanza" size={13} style={{ marginRight: 4, verticalAlign: -2 }} /> Sobre esta sección:</strong> aquí centralizas los procesos que tienen número de radicado. La consulta{" "}
        <strong>"Consultar Rama Judicial"</strong> trae el estado real desde la Consulta de Procesos Nacional Unificada
        (el mismo buscador público de la Rama Judicial, por número de radicado — no existe una API oficial del Estado
        para esto, así que si algún día cambian su página puede dejar de funcionar y hay que ajustarlo).
      </div>

      {sinRadicado.length > 0 && (
        <div
          style={{
            background: "#FEF3E2",
            border: "1px solid #FCE3B8",
            borderRadius: 10,
            padding: "14px 16px",
            marginBottom: 18,
            fontFamily: "Inter, sans-serif",
            fontSize: 12.5,
            color: "#92400E",
            lineHeight: 1.6,
          }}
        >
          <strong><Icono tipo="alerta" size={13} style={{ marginRight: 4, verticalAlign: -2 }} /> {sinRadicado.length} cliente{sinRadicado.length !== 1 ? "s" : ""} sin número de radicado:</strong>{" "}
          {sinRadicado.map((id) => clientes[id]?.nombre).filter(Boolean).join(", ")}. La revisión automática diaria y la
          consulta a la Rama Judicial solo funcionan si el cliente tiene el radicado registrado — agrégalo desde{" "}
          <strong>Clientes → Editar</strong> para que estos también queden vigilados.
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.muted, margin: 0 }}>
          {conRadicado.length} cliente{conRadicado.length !== 1 ? "s" : ""} con radicado registrado ({paresRadicado.length} radicado{paresRadicado.length !== 1 ? "s" : ""} en total)
          {sinRevisarHaceTiempo > 0 && (
            <span style={{ color: "#B45309", fontWeight: 600 }}> · {sinRevisarHaceTiempo} sin revisar hace 15+ días</span>
          )}
        </p>
        {conRadicado.length > 0 && (
          <button className="drx-btn-primary" style={buttonPrimary} onClick={consultarTodos} disabled={consultandoTodos}>
            {consultandoTodos ? (
              "Consultando todos…"
            ) : (
              <>
                <Icono tipo="refrescar" size={13} style={{ marginRight: 4, verticalAlign: -2 }} /> Consultar Rama Judicial (todos)
              </>
            )}
          </button>
        )}
      </div>

      {conRadicado.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {["Todos", ...ESTADOS_VIGILANCIA].map((estado) => {
            const cantidad =
              estado === "Todos" ? conRadicado.length : conRadicado.filter((id) => (clientes[id]?.estadoVigilancia || ESTADOS_VIGILANCIA[0]) === estado).length;
            const activo = filtroEstado === estado;
            return (
              <button
                key={estado}
                onClick={() => setFiltroEstado(estado)}
                style={{
                  fontFamily: "Inter, sans-serif",
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "6px 12px",
                  borderRadius: 999,
                  border: `1px solid ${activo ? COLORS.navy : COLORS.border}`,
                  background: activo ? COLORS.navy : "#fff",
                  color: activo ? "#fff" : COLORS.inkSoft,
                  cursor: "pointer",
                }}
              >
                {estado} ({cantidad})
              </button>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {conRadicadoFiltrados.map((id) => {
          const c = clientes[id];
          const dias = diasDesde(c.ultimaActuacion);
          const radicados = radicadosDeCliente(c);
          return (
            <Card key={id} style={{ borderLeft: `4px solid ${COLOR_AREA_PROCESO[c.areaProceso] || "#F5A524"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <AvatarIniciales nombre={c.nombre} />
                  <div>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 16, fontWeight: 700, margin: 0, color: COLORS.ink }}>{c.nombre}</p>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, margin: "3px 0 0" }}>
                    {c.tipoProceso} · {c.areaProceso} {dias !== null && `· última novedad hace ${dias} día${dias !== 1 ? "s" : ""}`}
                  </p>
                  </div>
                </div>
                <select
                  className="drx-input"
                  style={{ ...inputStyle, fontSize: 12, padding: "6px 10px", width: "auto" }}
                  value={c.estadoVigilancia || ESTADOS_VIGILANCIA[0]}
                  onChange={(e) => cambiarEstadoVigilancia(id, e.target.value)}
                >
                  {ESTADOS_VIGILANCIA.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {radicados.map((radicado) => {
                  const clave = `${id}:${radicado}`;
                  const resultado = resultados[clave];
                  const errorConsulta = errores[clave];
                  const estadoRama = estadoRamaPorRadicado(c, radicado);
                  return (
                    <div key={radicado} style={{ background: COLORS.surfaceSoft, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 10 }}>
                      <div style={{ margin: "0 0 8px" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "stretch",
                            borderRadius: 20,
                            border: `1px solid ${radicadoCopiado === clave ? "#C9E0C4" : COLORS.border}`,
                            overflow: "hidden",
                          }}
                        >
                          <button
                            type="button"
                            title="Copiar radicado (para pegarlo en Rama Judicial o en la Fiscalía)"
                            onClick={() => copiarRadicado(radicado, clave)}
                            style={{
                              fontFamily: "monospace",
                              fontSize: 11.5,
                              padding: "3px 9px",
                              background: radicadoCopiado === clave ? "#E4EEE2" : "#fff",
                              color: radicadoCopiado === clave ? "#2F5D3A" : COLORS.inkSoft,
                              cursor: "pointer",
                              border: "none",
                              display: "flex",
                              alignItems: "center",
                              gap: 5,
                            }}
                          >
                            {radicadoCopiado === clave ? (
                              "✓ Copiado"
                            ) : (
                              <>
                                Radicado: {radicado} <Icono tipo="portapapeles" size={11} />
                              </>
                            )}
                          </button>
                          <a
                            href="https://consultaprocesos.ramajudicial.gov.co/procesos"
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              fontFamily: "Inter, sans-serif",
                              fontSize: 11.5,
                              fontWeight: 600,
                              padding: "3px 9px",
                              background: "#EEF6EF",
                              color: "#2F5D3A",
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
                                fontSize: 11.5,
                                fontWeight: 600,
                                padding: "3px 9px",
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
                      </div>
                      {estadoRama?.consultadoEn ? (
                        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: COLORS.muted, margin: "0 0 8px" }}>
                          Última consulta: {new Date(estadoRama.consultadoEn).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}
                          {diasDesde(estadoRama.consultadoEn) >= 15 && (
                            <span style={{ color: "#B45309", fontWeight: 600, marginLeft: 6 }}>
                              <Icono tipo="alerta" size={10} style={{ marginRight: 2, verticalAlign: -1 }} />
                              lleva {diasDesde(estadoRama.consultadoEn)} días sin revisarse
                            </span>
                          )}
                        </p>
                      ) : (
                        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: "#B45309", fontWeight: 600, margin: "0 0 8px", display: "flex", alignItems: "center", gap: 4 }}>
                          <Icono tipo="alerta" size={10} /> Nunca se ha consultado en Rama Judicial
                        </p>
                      )}

                      <button
                        className="drx-btn-ghost"
                        style={{ ...buttonGhost, fontSize: 12.5, padding: "6px 12px", marginBottom: 8, background: "#fff" }}
                        onClick={() => consultarUno(id, radicado)}
                        disabled={consultando === clave}
                      >
                        {consultando === clave ? (
                          "Consultando…"
                        ) : (
                          <>
                            <Icono tipo="refrescar" size={13} style={{ marginRight: 4, verticalAlign: -2 }} /> Consultar Rama Judicial
                          </>
                        )}
                      </button>

                      {errorConsulta && <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "#B42318", margin: 0 }}>{errorConsulta}</p>}

                      {resultado && resultado.encontrado === false && (
                        <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, margin: 0 }}>
                          No se encontró ningún proceso con ese radicado en la Rama Judicial.
                        </p>
                      )}

                      {resultado?.encontrado && resultado.ultimaActuacion && (
                        <div style={{ background: "#fff", border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 12 }}>
                          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11.5, fontWeight: 600, color: COLORS.muted, marginBottom: 4 }}>
                            Última actuación en Rama Judicial ({resultado.proceso?.despacho || "despacho no informado"})
                          </p>
                          <p style={{ fontFamily: "Inter, sans-serif", fontSize: 13, color: COLORS.ink, margin: 0 }}>
                            {new Date(resultado.ultimaActuacion.fecha).toLocaleDateString("es-CO", { dateStyle: "medium" })} —{" "}
                            <strong>{resultado.ultimaActuacion.actuacion}</strong>
                          </p>
                          {resultado.ultimaActuacion.anotacion && (
                            <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.inkSoft, margin: "4px 0 0" }}>
                              {resultado.ultimaActuacion.anotacion}
                            </p>
                          )}
                          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                            <button className="drx-btn-primary" style={{ ...buttonPrimary, fontSize: 12, padding: "6px 12px" }} onClick={() => agregarComoNovedad(id, radicado)}>
                              + Agregar a la línea de tiempo
                            </button>
                            <button
                              className="drx-btn-ghost"
                              style={{ ...buttonGhost, fontSize: 12, padding: "6px 12px" }}
                              onClick={() => pedirExplicacion(id, radicado)}
                              disabled={explicando === clave}
                            >
                              {explicando === clave ? (
                                "Analizando…"
                              ) : (
                                <>
                                  <Icono tipo="foco" size={13} style={{ marginRight: 4, verticalAlign: -2 }} /> Explicar y sugerir con IA
                                </>
                              )}
                            </button>
                          </div>
                          {explicaciones[clave] && (
                            <div style={{ marginTop: 10, background: COLORS.accentSoft, border: "1px solid #C7D6EA", borderRadius: 8, padding: 10 }}>
                              <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.navy, margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                                {explicaciones[clave]}
                              </p>
                              <button
                                className="drx-btn-ghost"
                                style={{ ...buttonGhost, fontSize: 11, padding: "4px 10px", marginTop: 8 }}
                                onClick={() => copiarExplicacion(explicaciones[clave], clave)}
                              >
                                {explicacionCopiada === clave ? (
                                  "✓ Copiado"
                                ) : (
                                  <>
                                    <Icono tipo="portapapeles" size={13} style={{ marginRight: 4, verticalAlign: -2 }} /> Copiar
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <LineaDeTiempo
                cliente={c}
                onAgregar={(nota, fecha) => agregarNovedad(id, nota, fecha)}
                onEditarFecha={(entradaId, fecha) => editarFechaNovedad(id, entradaId, fecha)}
                onEditarNota={(entradaId, nota) => editarNotaNovedad(id, entradaId, nota)}
                onEliminar={(entradaId) => eliminarNovedad(id, entradaId)}
                onRestaurar={(entrada) => restaurarNovedad(id, entrada)}
                confirmar={confirmar}
              />
            </Card>
          );
        })}
        {conRadicado.length === 0 && (
          <EstadoVacio icono={<Icono tipo="balanza" size={26} />} texto="Ningún cliente tiene número de radicado registrado todavía. Agrégalo desde la pestaña Clientes." />
        )}
        {conRadicado.length > 0 && conRadicadoFiltrados.length === 0 && (
          <EstadoVacio icono={<Icono tipo="lupa" size={26} />} texto={`Ningún proceso en estado "${filtroEstado}".`} />
        )}
      </div>
    </div>
  );
}
