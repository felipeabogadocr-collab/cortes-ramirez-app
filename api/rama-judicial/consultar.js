// Consulta el estado de un proceso judicial en la Consulta de Procesos
// Nacional Unificada de la Rama Judicial, usando el mismo servicio público
// (no documentado oficialmente, sin llave de API) que usa su propia página:
// https://consultaprocesos.ramajudicial.gov.co
//
// GET /api/rama-judicial/consultar?radicado=11001310300120240012300

import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { dentroDelLimite } from "../_lib/rateLimit.js";
import { consultarProceso } from "../_lib/ramaJudicial.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Método no permitido" });
  }

  const admin = supabaseAdmin();
  const puedeContinuar = await dentroDelLimite(admin, req, "rama-judicial/consultar", 30, 60);
  if (!puedeContinuar) {
    return res.status(429).json({ error: "Demasiadas consultas. Espera un momento e inténtalo de nuevo." });
  }

  try {
    const data = await consultarProceso(req.query.radicado, { debug: req.query.debug === "1" });
    return res.status(200).json(data);
  } catch (err) {
    if (err.status === 400) {
      return res.status(400).json({ error: err.message });
    }
    console.error("Error consultando Rama Judicial:", err);
    return res.status(502).json({
      error:
        "No se pudo consultar la Rama Judicial en este momento. El servicio público que usan no es oficial y a veces cambia o falla — intenta de nuevo en un momento.",
      detalle: err.message,
    });
  }
}
