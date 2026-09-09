// Función serverless de Vercel: chat de IA para el administrador del panel.
// Usa la misma GEMINI_API_KEY (capa gratuita) que ya usa la app interna del
// despacho. Exige la contraseña del panel antes de responder nada, y nunca
// expone la llave de Gemini ni la de Supabase al navegador.

import { cargarEstadisticas } from "./panel-leads.js";

const GEMINI_MODEL = "gemini-2.0-flash";

function resumenParaIA(datos) {
  return JSON.stringify({
    total_personas_registradas: datos.totalRegistros,
    total_documentos_procesados: datos.totalDocumentos,
    documentos_por_herramienta: datos.porHerramienta,
    registros_por_dia_semana: datos.registrosPorDiaSemana,
    registros_ultimos_14_dias: datos.registrosPorFecha,
    documentos_ultimos_14_dias: datos.documentosPorFecha,
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { password, pregunta, modo } = req.body || {};
  if (!process.env.PANEL_PASSWORD || password !== process.env.PANEL_PASSWORD) {
    return res.status(401).json({ error: "Contraseña incorrecta" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY no configurada en el servidor." });
  }

  let datos;
  try {
    datos = await cargarEstadisticas();
  } catch {
    return res.status(500).json({ error: "No se pudieron cargar los datos de Supabase." });
  }

  const contexto = resumenParaIA(datos);
  const esInforme = modo === "informe";

  const systemInstruction = esInforme
    ? `Eres un analista que ayuda al despacho CR Abogados a entender el uso de "Folio", su herramienta gratuita de PDF. ` +
      `Con los datos JSON que te dan, escribe en español un análisis breve (máximo 120 palabras, en 2-3 párrafos cortos, sin encabezados ni markdown) ` +
      `sobre cómo va la adopción de la herramienta, y termina con hasta 3 recomendaciones concretas de mejora, separadas por saltos de línea y precedidas de "- ". ` +
      `Sé concreto y basado en los números, no inventes datos que no estén en el JSON.`
    : `Eres un asistente que ayuda al administrador de "Folio" (herramienta PDF gratuita de CR Abogados) a interpretar sus ` +
      `estadísticas de uso. Te paso los datos actuales en JSON. Responde en español, de forma breve y directa (máximo 80 palabras), ` +
      `basándote solo en esos datos. Si la pregunta no se puede responder con estos datos, dilo claramente.`;

  if (!esInforme && !pregunta) {
    return res.status(400).json({ error: "Falta 'pregunta'." });
  }

  const mensajeUsuario = esInforme
    ? `Datos actuales de Folio: ${contexto}`
    : `Datos actuales de Folio: ${contexto}\n\nPregunta: ${pregunta}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: mensajeUsuario }] }],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: { maxOutputTokens: 400 },
        }),
      }
    );
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data?.error?.message || "Error del asistente de IA." });
    }
    const texto = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    return res.status(200).json({ respuesta: texto.trim() || "No obtuve respuesta del asistente." });
  } catch {
    return res.status(502).json({ error: "No se pudo contactar al asistente de IA." });
  }
}
