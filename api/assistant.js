// Función serverless de Vercel: proxy hacia la API gratuita de Google Gemini
// (Google AI Studio). La clave nunca viaja al navegador.
//
// El frontend sigue enviando el mismo formato "estilo Anthropic" que usaba el
// prototipo original (model, max_tokens, system, tools, messages con bloques
// text/image/document/tool_use/tool_result) y recibe de vuelta una respuesta
// con la misma forma ({ content: [...] }), para no tener que tocar el resto
// de la app. Esta función se encarga de traducir en ambos sentidos hacia el
// formato que espera Gemini.

import { supabaseAdmin } from "./_lib/supabaseAdmin.js";
import { dentroDelLimite } from "./_lib/rateLimit.js";

const GEMINI_MODEL = "gemini-3.6-flash";
const MAX_TOKENS_CAP = 2000;

function toGeminiTools(tools) {
  if (!tools || tools.length === 0) return undefined;
  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      })),
    },
  ];
}

function toGeminiContents(messages) {
  const toolIdToName = {};
  const contents = [];

  for (const msg of messages) {
    const role = msg.role === "assistant" ? "model" : "user";
    const parts = [];

    if (typeof msg.content === "string") {
      parts.push({ text: msg.content });
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === "text") {
          parts.push({ text: block.text || "" });
        } else if (block.type === "image" && block.source) {
          parts.push({ inlineData: { mimeType: block.source.media_type, data: block.source.data } });
        } else if (block.type === "document" && block.source) {
          parts.push({ inlineData: { mimeType: block.source.media_type || "application/pdf", data: block.source.data } });
        } else if (block.type === "tool_use") {
          toolIdToName[block.id] = block.name;
          parts.push({ functionCall: { name: block.name, args: block.input || {} } });
        } else if (block.type === "tool_result") {
          const name = toolIdToName[block.tool_use_id] || "resultado_herramienta";
          const content =
            typeof block.content === "string" ? block.content : JSON.stringify(block.content);
          parts.push({ functionResponse: { name, response: { result: content } } });
        }
      }
    }

    if (parts.length > 0) contents.push({ role, parts });
  }

  return contents;
}

// Motivos por los que Gemini puede responder "OK" (200) pero sin texto
// utilizable: contenido bloqueado por seguridad, se acabaron los tokens antes
// de generar nada, etc. Sin esto, el frontend recibía un content vacío y
// mostraba un mensaje genérico de "no pude responder" sin decir por qué.
const RAZONES_SIN_RESPUESTA = {
  SAFETY: "Gemini bloqueó la respuesta por sus filtros de seguridad.",
  RECITATION: "Gemini bloqueó la respuesta por posible contenido citado/protegido.",
  MAX_TOKENS: "La respuesta se cortó porque llegó al límite de tokens antes de generar texto.",
  PROHIBITED_CONTENT: "Gemini bloqueó la respuesta por contenido no permitido.",
  OTHER: "Gemini no pudo generar una respuesta por un motivo desconocido.",
};

function fromGeminiResponse(geminiData) {
  const bloqueoPrevio = geminiData?.promptFeedback?.blockReason;
  if (bloqueoPrevio) {
    return { content: [], error: `Gemini bloqueó la solicitud (${bloqueoPrevio}). Prueba reformular el mensaje o quitar el archivo adjunto.` };
  }
  const candidate = geminiData?.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  const content = parts.map((part, idx) => {
    if (part.functionCall) {
      return {
        type: "tool_use",
        id: `call_${Date.now()}_${idx}`,
        name: part.functionCall.name,
        input: part.functionCall.args || {},
      };
    }
    return { type: "text", text: part.text || "" };
  });
  if (content.length === 0 && candidate?.finishReason && candidate.finishReason !== "STOP") {
    const razon = RAZONES_SIN_RESPUESTA[candidate.finishReason] || `Gemini terminó sin generar texto (${candidate.finishReason}).`;
    return { content: [], error: razon };
  }
  return { content };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY no configurada en el servidor" });
  }

  const { max_tokens, system, tools, messages } = req.body || {};
  if (!messages) {
    return res.status(400).json({ error: "Falta 'messages' en el cuerpo de la solicitud" });
  }

  const admin = supabaseAdmin();
  const puedeContinuar = await dentroDelLimite(admin, req, "assistant", 60, 60);
  if (!puedeContinuar) {
    return res.status(429).json({ error: "Demasiadas solicitudes al asistente. Espera un momento e inténtalo de nuevo." });
  }

  const contenidos = toGeminiContents(messages);
  const body = {
    contents: contenidos,
    generationConfig: { maxOutputTokens: Math.min(Number(max_tokens) || 700, MAX_TOKENS_CAP) },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  // Gemini rechaza con "invalid argument" la combinación de herramientas +
  // un archivo adjunto (imagen/PDF) en el mismo turno — así que si hay algún
  // adjunto en la conversación, de una vez se manda sin herramientas (no
  // reactivamente, para no depender de adivinar el texto exacto del error).
  const tieneAdjunto = contenidos.some((c) => (c.parts || []).some((p) => p.inlineData));
  const geminiTools = toGeminiTools(tools);
  if (geminiTools && !tieneAdjunto) body.tools = geminiTools;

  const llamarGemini = async (cuerpo) => {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    const data = await response.json();
    return { ok: response.ok, status: response.status, data };
  };

  try {
    let resultado = await llamarGemini(body);

    // Si Google respondió que se acabó la cuota gratuita (429), no tiene
    // sentido gastar otra solicitud reintentando — eso solo empeora el
    // problema. Se avisa directo con un mensaje claro, sin el texto técnico
    // de Google (enlaces, nombres de métricas, etc.).
    const esLimiteDeCuota = !resultado.ok && (resultado.status === 429 || resultado.data?.error?.status === "RESOURCE_EXHAUSTED");
    if (esLimiteDeCuota) {
      console.error("Límite de cuota de Gemini:", JSON.stringify(resultado.data));
      // Google manda cuánto esperar en un campo "RetryInfo" (retryDelay, ej. "17s")
      // dentro de error.details — lo leemos para poder bloquear el botón de
      // enviar ese tiempo exacto, en vez de dejar que reintenten de inmediato
      // y sigan gastando cuota sin darle chance a que se libere.
      const detalleReintento = (resultado.data?.error?.details || []).find((d) => d["@type"]?.includes("RetryInfo"));
      const segundos = detalleReintento?.retryDelay ? Math.ceil(parseFloat(detalleReintento.retryDelay)) : 20;
      return res.status(429).json({ error: "El asistente alcanzó el límite de uso gratuito por un momento. Espera unos segundos y vuelve a intentar.", retryAfterSegundos: segundos });
    }

    // Si falla con "invalid argument" por otra razón, se reintenta una vez
    // sin herramientas y sin adjuntos (solo el texto), para que la
    // conversación no se quede muerta — pero se avisa que el archivo no se
    // pudo procesar, en vez de responder como si lo hubiera leído.
    const esInvalidoDeNuevo = !resultado.ok && /invalid argument/i.test(resultado.data?.error?.message || "");
    let seOmitioAdjunto = false;
    let errorOriginalAdjunto = "";
    if (esInvalidoDeNuevo) {
      errorOriginalAdjunto = resultado.data?.error?.message || "";
      console.error("Gemini rechazo el adjunto, detalle completo:", JSON.stringify(resultado.data));
      const contenidosSoloTexto = contenidos.map((c) => ({ ...c, parts: c.parts.filter((p) => !p.inlineData) })).filter((c) => c.parts.length > 0);
      resultado = await llamarGemini({ ...body, contents: contenidosSoloTexto, tools: undefined });
      seOmitioAdjunto = resultado.ok;
    }

    if (!resultado.ok) {
      console.error("Error de Gemini:", JSON.stringify(resultado.data));
      const errStatus = resultado.data?.error?.status;
      if (errStatus === "RESOURCE_EXHAUSTED" || resultado.status === 429) {
        const detalleReintento = (resultado.data?.error?.details || []).find((d) => d["@type"]?.includes("RetryInfo"));
        const segundos = detalleReintento?.retryDelay ? Math.ceil(parseFloat(detalleReintento.retryDelay)) : 20;
        return res.status(429).json({ error: "El asistente alcanzó el límite de uso gratuito por un momento. Espera unos segundos y vuelve a intentar.", retryAfterSegundos: segundos });
      }
      return res.status(resultado.status).json({ error: resultado.data?.error?.message || "Error del asistente de IA" });
    }

    const respuesta = fromGeminiResponse(resultado.data);
    if (seOmitioAdjunto && respuesta.content) {
      respuesta.content.unshift({ type: "text", text: `No pude leer el archivo adjunto (motivo real de Gemini: "${errorOriginalAdjunto}"), así que respondo solo con base en tu mensaje:\n\n` });
    }
    return res.status(200).json(respuesta);
  } catch (err) {
    console.error("Error llamando a Gemini:", err);
    return res.status(502).json({ error: "No se pudo contactar al asistente de IA" });
  }
}
