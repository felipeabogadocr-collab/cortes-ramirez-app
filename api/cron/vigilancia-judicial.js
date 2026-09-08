// Cron diario (configurado en vercel.json): revisa TODOS los clientes de
// TODOS los despachos que tengan un número de radicado, consulta la Rama
// Judicial, y si hay una actuación más reciente que la última que se vio,
// la agrega automáticamente a la línea de tiempo del cliente y lo marca
// "Con novedad" — así el abogado no tiene que entrar a Vigilancia judicial
// y darle "Consultar todos" manualmente cada día.
//
// Reutiliza exactamente la misma lógica de comparación que ya existía en
// el botón "Consultar todos" del frontend (VigilanciaTab), solo que ahora
// corre sola una vez al día para todos los despachos a la vez, usando la
// llave service_role (por eso no puede vivir en el navegador).

import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { consultarProceso } from "../_lib/ramaJudicial.js";

export const maxDuration = 60;

const MAX_CLIENTES_POR_EJECUCION = 150;

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// Copia deliberada de la misma función en src/lib/utils.js (usada por el
// frontend) — un cliente puede tener varios radicados; se duplica aquí en
// vez de importarla para no depender de que el empaquetado de Vercel para
// funciones serverless incluya archivos fuera de api/.
function radicadosDeCliente(cliente) {
  if (Array.isArray(cliente?.radicados)) {
    const limpios = cliente.radicados.map((r) => (r || "").trim()).filter(Boolean);
    if (limpios.length > 0) return limpios;
  }
  return cliente?.radicado?.trim() ? [cliente.radicado.trim()] : [];
}

export default async function handler(req, res) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) {
    return res.status(500).json({ error: "Falta configurar CRON_SECRET en las variables de entorno de Vercel." });
  }
  if (req.headers.authorization !== `Bearer ${secreto}`) {
    return res.status(401).json({ error: "No autorizado" });
  }

  const admin = supabaseAdmin();

  const { data: clientes, error } = await admin
    .from("clientes")
    .select("id, despacho_id, data")
    .is("eliminado_en", null)
    .not("data->>radicado", "is", null)
    .limit(MAX_CLIENTES_POR_EJECUCION);

  if (error) {
    console.error("Error cargando clientes para vigilancia judicial:", error);
    return res.status(500).json({ error: error.message });
  }

  let revisados = 0;
  let conNovedad = 0;
  let conError = 0;

  for (const fila of clientes || []) {
    // "c" se va actualizando dentro del ciclo de radicados de ESTE mismo
    // cliente (no solo al final) — si no, un cliente con 2+ radicados con
    // novedad perdería la del primero al guardar la del segundo, porque
    // ambas escrituras partirían del mismo "data" original de la fila.
    let c = fila.data || {};
    const radicados = radicadosDeCliente(c);
    if (radicados.length === 0) continue;
    revisados++;

    for (const radicado of radicados) {
      try {
        const resultado = await consultarProceso(radicado);
        if (!resultado.encontrado || !resultado.ultimaActuacion?.fecha) continue;

        const esPrimario = radicados[0] === radicado;
        const estadoPrevio = (c.ramaJudicialPorRadicado || {})[radicado] || (esPrimario ? c.ramaJudicial : null);
        const fechaVista = estadoPrevio?.ultimaActuacionVistaFecha;
        const fechaNueva = resultado.ultimaActuacion.fecha;
        const esNueva = !fechaVista || new Date(fechaNueva) > new Date(fechaVista);

        const entradaEstado = {
          idProceso: resultado.idProceso,
          despacho: resultado.proceso?.despacho || null,
          ultimaActuacionVistaFecha: fechaNueva,
          consultadoEn: resultado.consultadoEn,
        };
        const ramaJudicialPorRadicado = { ...(c.ramaJudicialPorRadicado || {}), [radicado]: entradaEstado };
        c = { ...c, ramaJudicialPorRadicado, ...(esPrimario ? { ramaJudicial: entradaEstado } : {}) };

        if (!esNueva) continue;

        const texto = `Rama Judicial (radicado ${radicado}, ${resultado.proceso?.despacho || "despacho no informado"}) — ${resultado.ultimaActuacion.actuacion || "Actuación"}${
          resultado.ultimaActuacion.anotacion ? `: ${resultado.ultimaActuacion.anotacion}` : ""
        }`;
        const nuevaEntradaTimeline = { id: uid(), fecha: new Date().toISOString(), nota: `[Detectado automáticamente] ${texto}` };
        c = { ...c, timeline: [...(c.timeline || []), nuevaEntradaTimeline], ultimaActuacion: new Date().toISOString(), estadoVigilancia: "Con novedad" };
        conNovedad++;
      } catch (e) {
        conError++;
        console.error(`Error revisando radicado ${radicado} de cliente ${fila.id}:`, e.message);
      }
    }

    try {
      const { error: updateError } = await admin.from("clientes").update({ data: c, updated_at: new Date().toISOString() }).eq("id", fila.id);
      if (updateError) throw updateError;
    } catch (e) {
      conError++;
      console.error(`Error guardando cliente ${fila.id} tras revisar sus radicados:`, e.message);
    }
  }

  return res.status(200).json({ revisados, conNovedad, conError });
}
