import { useState, useEffect, useCallback } from "react";
import { storageGet, storageSet } from "../lib/storage";
import {
  COLORS, uid, diasDesde, useIndex, inputStyle, buttonPrimary, buttonGhost, Card,
  EncabezadoSeccion, Icono, AvatarIniciales, EstadoVacio, LineaDeTiempo, COLOR_AREA_PROCESO,
  ESTADOS_VIGILANCIA, consultarRamaJudicial,
} from "../App.jsx";

async function explicarActuacion(actuacion, anotacion) {
  const response = await fetch("/api/assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 300,
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
  return (data.content || []).map((b) => b.text || "").join("").trim();
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

  const agregarNovedad = async (id, nota) => {
    const c = clientes[id];
    const nuevaEntrada = { id: uid(), fecha: new Date().toISOString(), nota };
    const actualizado = { ...c, timeline: [...(c.timeline || []), nuevaEntrada], ultimaActuacion: new Date().toISOString() };
    await storageSet(`cliente:${id}`, JSON.stringify(actualizado), false);
    setClientes((prev) => ({ ...prev, [id]: actualizado }));
    return actualizado;
  };

  // Consulta un cliente puntual y solo muestra el resultado (no toca nada
  // todavía) — el abogado decide si lo agrega a la línea de tiempo.
  const consultarUno = async (id) => {
    const c = clientes[id];
    setConsultando(id);
    setErrores((prev) => ({ ...prev, [id]: null }));
    try {
      const data = await consultarRamaJudicial(c.radicado);
      setResultados((prev) => ({ ...prev, [id]: data }));
    } catch (e) {
      setErrores((prev) => ({ ...prev, [id]: e.message }));
    }
    setConsultando(null);
  };

  // "Marcar visto en Rama Judicial": guarda cuál fue la última actuación que
  // ya se revisó, para poder comparar en la próxima consulta y avisar solo
  // de lo nuevo.
  const guardarComoVista = async (id, data) => {
    const c = clientes[id];
    const actualizado = {
      ...c,
      ramaJudicial: {
        idProceso: data.idProceso,
        despacho: data.proceso?.despacho || null,
        ultimaActuacionVistaFecha: data.ultimaActuacion?.fecha || null,
        consultadoEn: data.consultadoEn,
      },
    };
    await storageSet(`cliente:${id}`, JSON.stringify(actualizado), false);
    setClientes((prev) => ({ ...prev, [id]: actualizado }));
  };

  const agregarComoNovedad = async (id) => {
    const data = resultados[id];
    if (!data?.ultimaActuacion) return;
    const texto = `Rama Judicial (${data.proceso?.despacho || "despacho no informado"}) — ${data.ultimaActuacion.actuacion || "Actuación"}${
      data.ultimaActuacion.anotacion ? `: ${data.ultimaActuacion.anotacion}` : ""
    }`;
    await agregarNovedad(id, texto);
    await guardarComoVista(id, data);
    await cambiarEstadoVigilancia(id, "Con novedad");
  };

  const pedirExplicacion = async (id) => {
    const data = resultados[id];
    if (!data?.ultimaActuacion) return;
    setExplicando(id);
    try {
      const texto = await explicarActuacion(data.ultimaActuacion.actuacion, data.ultimaActuacion.anotacion);
      setExplicaciones((prev) => ({ ...prev, [id]: texto || "No pude generar una explicación en este momento." }));
    } catch (e) {
      setExplicaciones((prev) => ({ ...prev, [id]: "No pude generar una explicación en este momento." }));
    }
    setExplicando(null);
  };

  const conRadicado = ids.filter((id) => clientes[id]?.radicado?.trim());
  const sinRadicado = ids.filter((id) => !clientes[id]?.radicado?.trim());
  const sinRevisarHaceTiempo = conRadicado.filter((id) => {
    const consultadoEn = clientes[id]?.ramaJudicial?.consultadoEn;
    return !consultadoEn || diasDesde(consultadoEn) >= 15;
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

  // Consulta todos los procesos con radicado y marca automáticamente "Con
  // novedad" (y agrega la actuación a la línea de tiempo) solo en los que
  // tengan una actuación más reciente que la última vez que se revisó.
  const consultarTodos = async () => {
    setConsultandoTodos(true);
    for (const id of conRadicado) {
      const c = clientes[id];
      try {
        const data = await consultarRamaJudicial(c.radicado);
        setResultados((prev) => ({ ...prev, [id]: data }));
        setErrores((prev) => ({ ...prev, [id]: null }));
        const fechaVista = c.ramaJudicial?.ultimaActuacionVistaFecha;
        const fechaNueva = data.ultimaActuacion?.fecha;
        if (fechaNueva && (!fechaVista || new Date(fechaNueva) > new Date(fechaVista))) {
          const texto = `Rama Judicial (${data.proceso?.despacho || "despacho no informado"}) — ${data.ultimaActuacion.actuacion || "Actuación"}${
            data.ultimaActuacion.anotacion ? `: ${data.ultimaActuacion.anotacion}` : ""
          }`;
          const actualizado = await agregarNovedad(id, texto);
          await guardarComoVista(id, data);
          await storageSet(
            `cliente:${id}`,
            JSON.stringify({ ...actualizado, estadoVigilancia: "Con novedad", ramaJudicial: { idProceso: data.idProceso, despacho: data.proceso?.despacho || null, ultimaActuacionVistaFecha: fechaNueva, consultadoEn: data.consultadoEn } }),
            false
          );
        }
      } catch (e) {
        setErrores((prev) => ({ ...prev, [id]: e.message }));
      }
    }
    await cargar();
    setConsultandoTodos(false);
  };

  return (
    <div>
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
          {conRadicado.length} proceso{conRadicado.length !== 1 ? "s" : ""} con radicado registrado
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
          const resultado = resultados[id];
          const errorConsulta = errores[id];
          return (
            <Card key={id} style={{ borderLeft: `4px solid ${COLOR_AREA_PROCESO[c.areaProceso] || "#F5A524"}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <AvatarIniciales nombre={c.nombre} />
                  <div>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 16, fontWeight: 700, margin: 0, color: COLORS.ink }}>{c.nombre}</p>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.inkSoft, margin: "4px 0 0", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span
                      title="Copiar radicado"
                      onClick={() => copiarRadicado(c.radicado, id)}
                      style={{ fontFamily: "monospace", cursor: "pointer", color: radicadoCopiado === id ? "#1DA851" : COLORS.inkSoft, textDecoration: radicadoCopiado === id ? "none" : "underline dotted" }}
                    >
                      {radicadoCopiado === id ? "✓ Copiado" : `Radicado: ${c.radicado}`}
                    </span>
                    <a
                      href="https://consultaprocesos.ramajudicial.gov.co/procesos"
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: COLORS.accentBright, fontSize: 11.5, fontWeight: 600, textDecoration: "none" }}
                    >
                      Ver en Rama Judicial ↗
                    </a>
                  </p>
                  <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, margin: "3px 0 0" }}>
                    {c.tipoProceso} · {c.areaProceso} {dias !== null && `· última novedad hace ${dias} día${dias !== 1 ? "s" : ""}`}
                  </p>
                  {c.ramaJudicial?.consultadoEn ? (
                    <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: COLORS.muted, margin: "3px 0 0" }}>
                      Última consulta a Rama Judicial: {new Date(c.ramaJudicial.consultadoEn).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}
                      {diasDesde(c.ramaJudicial.consultadoEn) >= 15 && (
                        <span style={{ color: "#B45309", fontWeight: 600, marginLeft: 6 }}>
                          <Icono tipo="alerta" size={10} style={{ marginRight: 2, verticalAlign: -1 }} />
                          lleva {diasDesde(c.ramaJudicial.consultadoEn)} días sin revisarse
                        </span>
                      )}
                    </p>
                  ) : (
                    <p style={{ fontFamily: "Inter, sans-serif", fontSize: 11, color: "#B45309", fontWeight: 600, margin: "3px 0 0", display: "flex", alignItems: "center", gap: 4 }}>
                      <Icono tipo="alerta" size={10} /> Nunca se ha consultado en Rama Judicial
                    </p>
                  )}
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

              <button
                className="drx-btn-ghost"
                style={{ ...buttonGhost, fontSize: 12.5, padding: "7px 14px", marginBottom: 10 }}
                onClick={() => consultarUno(id)}
                disabled={consultando === id}
              >
                {consultando === id ? (
                  "Consultando…"
                ) : (
                  <>
                    <Icono tipo="refrescar" size={13} style={{ marginRight: 4, verticalAlign: -2 }} /> Consultar Rama Judicial
                  </>
                )}
              </button>

              {errorConsulta && (
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: "#B42318", marginBottom: 10 }}>{errorConsulta}</p>
              )}

              {resultado && resultado.encontrado === false && (
                <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12, color: COLORS.muted, marginBottom: 10 }}>
                  No se encontró ningún proceso con ese radicado en la Rama Judicial.
                </p>
              )}

              {resultado?.encontrado && resultado.ultimaActuacion && (
                <div style={{ background: COLORS.surfaceSoft, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 12, marginBottom: 10 }}>
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
                    <button className="drx-btn-primary" style={{ ...buttonPrimary, fontSize: 12, padding: "6px 12px" }} onClick={() => agregarComoNovedad(id)}>
                      + Agregar a la línea de tiempo
                    </button>
                    <button
                      className="drx-btn-ghost"
                      style={{ ...buttonGhost, fontSize: 12, padding: "6px 12px" }}
                      onClick={() => pedirExplicacion(id)}
                      disabled={explicando === id}
                    >
                      {explicando === id ? (
                        "Analizando…"
                      ) : (
                        <>
                          <Icono tipo="foco" size={13} style={{ marginRight: 4, verticalAlign: -2 }} /> Explicar y sugerir con IA
                        </>
                      )}
                    </button>
                  </div>
                  {explicaciones[id] && (
                    <div style={{ marginTop: 10, background: COLORS.accentSoft, border: "1px solid #C7D6EA", borderRadius: 8, padding: 10 }}>
                      <p style={{ fontFamily: "Inter, sans-serif", fontSize: 12.5, color: COLORS.navy, margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                        {explicaciones[id]}
                      </p>
                      <button
                        className="drx-btn-ghost"
                        style={{ ...buttonGhost, fontSize: 11, padding: "4px 10px", marginTop: 8 }}
                        onClick={() => copiarExplicacion(explicaciones[id], id)}
                      >
                        {explicacionCopiada === id ? (
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

              <LineaDeTiempo cliente={c} onAgregar={(nota) => agregarNovedad(id, nota)} />
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
