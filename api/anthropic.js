// Función serverless de Vercel: hace de proxy hacia la API de Anthropic para
// que la clave secreta nunca viaje al navegador. El frontend llama a
// "/api/anthropic" exactamente con el mismo cuerpo (model, max_tokens, system,
// tools, messages) que antes enviaba directo a api.anthropic.com.

const ALLOWED_MODELS = new Set(["claude-sonnet-4-6"]);
const MAX_TOKENS_CAP = 2000;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY no configurada en el servidor" });
  }

  const { model, max_tokens, system, tools, messages } = req.body || {};

  if (!messages) {
    return res.status(400).json({ error: "Falta 'messages' en el cuerpo de la solicitud" });
  }

  const safeModel = ALLOWED_MODELS.has(model) ? model : "claude-sonnet-4-6";
  const safeMaxTokens = Math.min(Number(max_tokens) || 700, MAX_TOKENS_CAP);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: safeModel,
        max_tokens: safeMaxTokens,
        ...(system ? { system } : {}),
        ...(tools ? { tools } : {}),
        messages,
      }),
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    console.error("Error llamando a Anthropic:", err);
    return res.status(502).json({ error: "No se pudo contactar al asistente de IA" });
  }
}
