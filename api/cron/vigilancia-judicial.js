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
    const c = fila.data || {};
    const radicado = (c.radicado || "").trim();
    if (!radicado) continue;
    revisados++;

    try {
      const resultado = await consultarProceso(radicado);
      if (!resultado.encontrado || !resultado.ultimaActuacion?.fecha) continue;

      const fechaVista = c.ramaJudicial?.ultimaActuacionVistaFecha;
      const fechaNueva = resultado.ultimaActuacion.fecha;
      const esNueva = !fechaVista || new Date(fechaNueva) > new Date(fechaVista);
      if (!esNueva) continue;

      const texto = `Rama Judicial (${resultado.proceso?.despacho || "despacho no informado"}) — ${resultado.ultimaActuacion.actuacion || "Actuación"}${
        resultado.ultimaActuacion.anotacion ? `: ${resultado.ultimaActuacion.anotacion}` : ""
      }`;
      const nuevaEntradaTimeline = { id: uid(), fecha: new Date().toISOString(), nota: `[Detectado automáticamente] ${texto}` };

      const actualizado = {
        ...c,
        timeline: [...(c.timeline || []), nuevaEntradaTimeline],
        ultimaActuacion: new Date().toISOString(),
        estadoVigilancia: "Con novedad",
        ramaJudicial: {
          idProceso: resultado.idProceso,
          despacho: resultado.proceso?.despacho || null,
          ultimaActuacionVistaFecha: fechaNueva,
          consultadoEn: resultado.consultadoEn,
        },
      };

      const { error: updateError } = await admin.from("clientes").update({ data: actualizado, updated_at: new Date().toISOString() }).eq("id", fila.id);
      if (updateError) throw updateError;
      conNovedad++;
    } catch (e) {
      conError++;
      console.error(`Error revisando radicado de cliente ${fila.id}:`, e.message);
    }
  }

  return res.status(200).json({ revisados, conNovedad, conError });
}
