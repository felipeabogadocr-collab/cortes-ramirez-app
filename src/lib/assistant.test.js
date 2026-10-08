// Pruebas del proxy de IA (api/assistant.js): reintentos cuando Google está
// saturado y paso a los modelos de respaldo, con la red simulada.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../api/_lib/supabaseAdmin.js", () => ({ supabaseAdmin: () => ({}) }));
vi.mock("../../api/_lib/rateLimit.js", () => ({ dentroDelLimite: async () => true, dentroDelLimitePorClave: async () => true }));

process.env.GEMINI_API_KEY = "test";
process.env.GEMINI_MODELOS_RESPALDO = "modelo-respaldo";
const { default: handler } = await import("../../api/assistant.js");

const saturado = { ok: false, status: 503, json: async () => ({ error: { code: 503, status: "UNAVAILABLE", message: "This model is currently experiencing high demand." } }) };
const exito = { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: "Nota redactada." }] }, finishReason: "STOP" }] }) };

function llamar() {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      setHeader() {},
      status(c) {
        this.statusCode = c;
        return this;
      },
      json(d) {
        resolve({ status: this.statusCode, data: d });
      },
    };
    handler({ method: "POST", headers: {}, body: { messages: [{ role: "user", content: "se envia contrato" }] } }, res);
  });
}

let urls;
beforeEach(() => {
  urls = [];
});

describe("asistente de IA cuando Google está saturado", () => {
  it("reintenta y responde normal si el segundo intento funciona", async () => {
    const respuestas = [saturado, exito];
    globalThis.fetch = vi.fn(async (url) => (urls.push(url), respuestas.shift()));
    const r = await llamar();
    expect(r.status).toBe(200);
    expect(r.data.content[0].text).toBe("Nota redactada.");
    expect(urls).toHaveLength(2);
  });

  it("si el modelo principal sigue saturado, usa el modelo de respaldo", async () => {
    const respuestas = [saturado, saturado, saturado, exito];
    globalThis.fetch = vi.fn(async (url) => (urls.push(url), respuestas.shift()));
    const r = await llamar();
    expect(r.status).toBe(200);
    expect(urls[3]).toContain("/models/modelo-respaldo:");
  });

  it("si todo falla, devuelve un mensaje claro en español marcado como saturado", async () => {
    globalThis.fetch = vi.fn(async (url) => (urls.push(url), saturado));
    const r = await llamar();
    expect(r.status).toBe(503);
    expect(r.data.saturado).toBe(true);
    expect(r.data.error).toMatch(/saturada/);
  });
});
