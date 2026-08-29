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

const GEMINI_MODEL = "gemini-2.0-flash";
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

  const body = {
    contents: toGeminiContents(messages),
    generationConfig: { maxOutputTokens: Math.min(Number(max_tokens) || 700, MAX_TOKENS_CAP) },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  const geminiTools = toGeminiTools(tools);
  if (geminiTools) body.tools = geminiTools;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    const data = await response.json();
    if (!response.ok) {
      console.error("Error de Gemini:", data);
      return res.status(response.status).json({ error: data?.error?.message || "Error del asistente de IA" });
    }

    return res.status(200).json(fromGeminiResponse(data));
  } catch (err) {
    console.error("Error llamando a Gemini:", err);
    return res.status(502).json({ error: "No se pudo contactar al asistente de IA" });
  }
}
