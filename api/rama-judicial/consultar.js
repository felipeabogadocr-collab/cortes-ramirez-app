// Consulta el estado de un proceso judicial en la Consulta de Procesos
// Nacional Unificada de la Rama Judicial, usando el mismo servicio público
// (no documentado oficialmente, sin llave de API) que usa su propia página:
// https://consultaprocesos.ramajudicial.gov.co
//
// GET /api/rama-judicial/consultar?radicado=11001310300120240012300

const BASE = "https://consultaprocesos.ramajudicial.gov.co:448/api/v2";

function limpiarRadicado(radicado) {
  return (radicado || "").replace(/\D/g, "");
}

// La Rama Judicial ha cambiado el nombre exacto de algunos campos entre
// versiones de su API interna. Estas funciones son tolerantes: prueban
// varios nombres posibles para no romperse por un cambio menor.
function campo(obj, ...nombres) {
  for (const n of nombres) {
    if (obj && obj[n] !== undefined && obj[n] !== null) return obj[n];
  }
  return null;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Método no permitido" });
  }

  const radicado = limpiarRadicado(req.query.radicado);
  if (radicado.length < 11) {
    return res.status(400).json({ error: "Número de radicado inválido" });
  }

  const headers = {
    Accept: "application/json",
    "User-Agent": "Mozilla/5.0 (compatible; CortesRamirezAbogados/1.0)",
  };

  try {
    const busquedaUrl = `${BASE}/Procesos/Consulta/NumeroRadicacion?numero=${radicado}&SoloActivos=false&pagina=1`;
    const busquedaRes = await fetch(busquedaUrl, { headers });
    if (!busquedaRes.ok) {
      throw new Error(`La Rama Judicial respondió ${busquedaRes.status} al buscar el radicado`);
    }
    const busquedaData = await busquedaRes.json();
    const procesos = busquedaData?.procesos || busquedaData?.Procesos || [];

    if (!procesos.length) {
      return res.status(200).json({ encontrado: false });
    }

    const proceso = procesos[0];
    const idProceso = campo(proceso, "idProceso", "IdProceso", "id");
    const debug = req.query.debug === "1";
    const debugInfo = { idProceso, claves: Object.keys(proceso) };

    let actuaciones = [];
    if (idProceso) {
      const actuacionesUrl = `${BASE}/Proceso/Actuaciones/${idProceso}?pagina=1`;
      const actuacionesRes = await fetch(actuacionesUrl, { headers });
      debugInfo.actuacionesUrl = actuacionesUrl;
      debugInfo.actuacionesStatus = actuacionesRes.status;
      const actuacionesTexto = await actuacionesRes.text();
      if (debug) debugInfo.actuacionesRespuestaCruda = actuacionesTexto.slice(0, 1500);
      if (actuacionesRes.ok) {
        try {
          const actuacionesData = JSON.parse(actuacionesTexto);
          actuaciones = actuacionesData?.actuaciones || actuacionesData?.Actuaciones || [];
          if (debug) debugInfo.actuacionesClaves = Array.isArray(actuacionesData) ? "es-array" : Object.keys(actuacionesData || {});
        } catch (e) {
          debugInfo.errorParseando = e.message;
        }
      }
    }

    const actuacionesNormalizadas = actuaciones
      .map((a) => ({
        fecha: campo(a, "fechaActuacion", "FechaActuacion"),
        actuacion: campo(a, "actuacion", "Actuacion"),
        anotacion: campo(a, "anotacion", "Anotacion"),
      }))
      .filter((a) => a.fecha)
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    return res.status(200).json({
      encontrado: true,
      idProceso,
      proceso: {
        despacho: campo(proceso, "despacho", "Despacho"),
        departamento: campo(proceso, "departamento", "Departamento"),
        sujetosProcesales: campo(proceso, "sujetosProcesales", "SujetosProcesales"),
        fechaUltimaActuacion: campo(proceso, "fechaUltimaActuacion", "FechaUltimaActuacion"),
      },
      ultimaActuacion: actuacionesNormalizadas[0] || null,
      actuaciones: actuacionesNormalizadas.slice(0, 15),
      consultadoEn: new Date().toISOString(),
      ...(debug ? { debug: debugInfo } : {}),
    });
  } catch (err) {
    console.error("Error consultando Rama Judicial:", err);
    return res.status(502).json({
      error:
        "No se pudo consultar la Rama Judicial en este momento. El servicio público que usan no es oficial y a veces cambia o falla — intenta de nuevo en un momento.",
      detalle: err.message,
    });
  }
}
