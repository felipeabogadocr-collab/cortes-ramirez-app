// Herramienta temporal de diagnóstico: prueba varias rutas candidatas del
// endpoint de actuaciones de la Rama Judicial y reporta cuál responde 200.
// GET /api/rama-judicial/probar?idProceso=3242404821&idConexion=320

const BASE = "https://consultaprocesos.ramajudicial.gov.co:448/api/v2";

export default async function handler(req, res) {
  const idProceso = req.query.idProceso;
  const idConexion = req.query.idConexion || "0";
  if (!idProceso) return res.status(400).json({ error: "Falta idProceso" });

  const headers = {
    Accept: "application/json",
    "User-Agent": "Mozilla/5.0 (compatible; CortesRamirezAbogados/1.0)",
  };

  const candidatas = [
    `/Actuaciones/Consulta/Proceso?idProceso=${idProceso}&idConexion=${idConexion}&pagina=1&Filtro=`,
    `/Procesos/${idProceso}/Actuaciones`,
    `/Actuaciones/${idProceso}?idConexion=${idConexion}&pagina=1`,
    `/Procesos/Actuaciones?idProceso=${idProceso}&idConexion=${idConexion}&pagina=1`,
    `/Procesos/Detalle/${idProceso}?idConexion=${idConexion}`,
    `/Actuaciones/Consulta/ProcesoAsociado?idProceso=${idProceso}&idConexion=${idConexion}&pagina=1`,
    `/Procesos/${idProceso}/actuaciones?idConexion=${idConexion}&pagina=1`,
    `/Actuacion/Consulta/Proceso?idProceso=${idProceso}&idConexion=${idConexion}&pagina=1`,
    `/Procesos/Consulta/Actuaciones?idProceso=${idProceso}&idConexion=${idConexion}&pagina=1`,
    `/Procesos/${idProceso}?idConexion=${idConexion}`,
  ];

  const resultados = [];
  for (const ruta of candidatas) {
    const url = `${BASE}${ruta}`;
    try {
      const r = await fetch(url, { headers });
      const texto = await r.text();
      resultados.push({ ruta, status: r.status, ok: r.ok, largo: texto.length, muestra: r.ok ? texto.slice(0, 300) : undefined });
    } catch (e) {
      resultados.push({ ruta, error: e.message });
    }
  }

  return res.status(200).json({ resultados });
}
