// Pruebas del cobro de la suscripción a Nomos con Wompi
// (api/despachos/reportar-pago.js), con Supabase y la red simulados.
import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

const sha256 = (t) => crypto.createHash("sha256").update(t).digest("hex");
const DESPACHO = "11111111-2222-3333-4444-555555555555";

// --- Supabase simulado: guarda en memoria los pagos y los cambios al despacho.
let pagos;
let despachoActualizado;
let despacho; // estado simulado de la fila del despacho
let rol;
const admin = {
  auth: { getUser: async () => ({ data: { user: { id: "u1", email: "a@b.co" } }, error: null }) },
  from(tabla) {
    const q = { filtros: {} };
    const api = {
      select: () => api,
      eq: (col, val) => ((q.filtros[col] = val), api),
      order: () => api,
      maybeSingle: async () => {
        if (tabla === "perfiles") return { data: { despacho_id: DESPACHO, rol } };
        if (tabla === "despachos") return { data: { ...despacho } };
        if (tabla === "plataforma_pagos") return { data: pagos.find((p) => p.wompi_transaccion_id === q.filtros.wompi_transaccion_id) || null };
        return { data: null };
      },
      insert: async (fila) => {
        if (pagos.some((p) => p.wompi_transaccion_id === fila.wompi_transaccion_id)) return { error: { code: "23505" } };
        pagos.push(fila);
        return { error: null };
      },
      update: (cambios) => ({
        eq: async (col, val) => {
          despachoActualizado = { ...cambios, [col]: val };
          despacho = { ...despacho, ...cambios };
          return { error: null };
        },
      }),
    };
    return api;
  },
};
vi.mock("../../api/_lib/supabaseAdmin.js", () => ({ supabaseAdmin: () => admin }));
vi.mock("../../api/_lib/rateLimit.js", () => ({ dentroDelLimite: async () => true }));

const { default: handler, extenderUnMes } = await import("../../api/despachos/reportar-pago.js");

function llamar({ method = "POST", query = {}, body = {}, headers = {} } = {}) {
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
    handler({ method, query, body, headers: { host: "nomos.test", authorization: "Bearer x", ...headers } }, res);
  });
}

function evento(tx, secreto = "test_events_abc") {
  const timestamp = 1700000000;
  const props = ["transaction.id", "transaction.status", "transaction.amount_in_cents"];
  const checksum = sha256(`${tx.id}${tx.status}${tx.amount_in_cents}${timestamp}${secreto}`);
  return { event: "transaction.updated", data: { transaction: tx }, signature: { properties: props, checksum }, timestamp };
}

beforeEach(() => {
  pagos = [];
  despachoActualizado = null;
  despacho = { id: DESPACHO, pagado_hasta: null };
  rol = "Administrador";
  process.env.WOMPI_PRIVATE_KEY = "prv_test_priv";
  process.env.WOMPI_PUBLIC_KEY = "pub_test_xyz";
  process.env.WOMPI_INTEGRITY_SECRET = "test_integrity_123";
  process.env.WOMPI_EVENTS_SECRET = "test_events_abc";
});

describe("pagos de suscripción con Wompi", () => {
  it("arma el link con el precio del servidor y la firma de integridad correcta", async () => {
    const r = await llamar({ body: { accion: "wompi_checkout", plan: "despacho" } });
    expect(r.status).toBe(200);
    const url = new URL(r.data.url);
    expect(url.origin).toBe("https://checkout.wompi.co");
    const ref = url.searchParams.get("reference");
    expect(ref.startsWith(`NOMOS_${DESPACHO}_despacho_`)).toBe(true);
    expect(url.searchParams.get("amount-in-cents")).toBe("12000000");
    expect(url.searchParams.get("signature:integrity")).toBe(sha256(`${ref}12000000COPtest_integrity_123`));
  });

  it("rechaza un plan inventado", async () => {
    const r = await llamar({ body: { accion: "wompi_checkout", plan: "gratis" } });
    expect(r.status).toBe(400);
  });

  it("aviso aprobado con firma válida: anota el pago y activa el despacho (una sola vez)", async () => {
    const tx = { id: "tx-1", status: "APPROVED", amount_in_cents: 8000000, currency: "COP", reference: `NOMOS_${DESPACHO}_abogado_1`, payment_method_type: "PSE" };
    const r1 = await llamar({ query: { wompi: "evento" }, body: evento(tx), headers: { authorization: "" } });
    const r2 = await llamar({ query: { wompi: "evento" }, body: evento(tx), headers: { authorization: "" } });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(pagos).toHaveLength(1);
    expect(pagos[0]).toMatchObject({ despacho_id: DESPACHO, valor: 80000, wompi_transaccion_id: "tx-1" });
    expect(despachoActualizado).toMatchObject({ activo: true, prueba_hasta: null, id: DESPACHO });
  });

  it("ignora un aviso con firma falsa", async () => {
    const tx = { id: "tx-2", status: "APPROVED", amount_in_cents: 8000000, currency: "COP", reference: `NOMOS_${DESPACHO}_abogado_1` };
    const r = await llamar({ query: { wompi: "evento" }, body: evento(tx, "otro_secreto"), headers: { authorization: "" } });
    expect(r.status).toBe(401);
    expect(pagos).toHaveLength(0);
    expect(despachoActualizado).toBeNull();
  });

  it("no activa si el monto pagado no es el del plan", async () => {
    const tx = { id: "tx-3", status: "APPROVED", amount_in_cents: 100000, currency: "COP", reference: `NOMOS_${DESPACHO}_despacho_1` };
    const r = await llamar({ query: { wompi: "evento" }, body: evento(tx), headers: { authorization: "" } });
    expect(r.status).toBe(200);
    expect(pagos).toHaveLength(0);
    expect(despachoActualizado).toBeNull();
  });

  it("no activa pagos rechazados", async () => {
    const tx = { id: "tx-4", status: "DECLINED", amount_in_cents: 8000000, currency: "COP", reference: `NOMOS_${DESPACHO}_abogado_1` };
    await llamar({ query: { wompi: "evento" }, body: evento(tx), headers: { authorization: "" } });
    expect(pagos).toHaveLength(0);
  });

  it("sin llaves configuradas, el link de pago no se ofrece", async () => {
    delete process.env.WOMPI_PUBLIC_KEY;
    const cfg = await llamar({ method: "GET", query: { wompi: "config" } });
    expect(cfg.data.habilitado).toBe(false);
    const r = await llamar({ body: { accion: "wompi_checkout", plan: "abogado" } });
    expect(r.status).toBe(503);
  });

  it("un pago aprobado deja el plan pagado un mes; el aviso repetido no regala otro mes", async () => {
    const tx = { id: "tx-9", status: "APPROVED", amount_in_cents: 12000000, currency: "COP", reference: `NOMOS_${DESPACHO}_despacho_1` };
    await llamar({ query: { wompi: "evento" }, body: evento(tx), headers: { authorization: "" } });
    const primera = new Date(despacho.pagado_hasta);
    const dias = (primera.getTime() - Date.now()) / 86400000;
    expect(dias).toBeGreaterThan(27);
    expect(dias).toBeLessThan(32);
    expect(despacho.plan).toBe("despacho");
    await llamar({ query: { wompi: "evento" }, body: evento(tx), headers: { authorization: "" } });
    expect(new Date(despacho.pagado_hasta).getTime()).toBe(primera.getTime());
  });

  it("pagar antes de tiempo suma el mes sobre la fecha que ya tenía", () => {
    const enDiezDias = new Date(Date.now() + 10 * 86400000);
    const nueva = new Date(extenderUnMes(enDiezDias.toISOString()));
    const esperada = new Date(enDiezDias);
    esperada.setMonth(esperada.getMonth() + 1);
    expect(nueva.getTime()).toBe(esperada.getTime());
  });

  it("solo el Administrador puede activar el cobro automático", async () => {
    rol = "Abogado";
    const r = await llamar({ body: { accion: "wompi_activar_cobro", token: "tok", acceptanceToken: "acc", plan: "abogado" } });
    expect(r.status).toBe(403);
  });

  it("activar el cobro automático guarda la tarjeta; si el plan sigue vigente no cobra todavía", async () => {
    despacho.pagado_hasta = new Date(Date.now() + 5 * 86400000).toISOString();
    const llamadas = [];
    globalThis.fetch = vi.fn(async (url, opciones) => {
      llamadas.push({ url, opciones });
      return { ok: true, json: async () => ({ data: { id: 777 } }) };
    });
    const r = await llamar({ body: { accion: "wompi_activar_cobro", token: "tok_test", acceptanceToken: "acc", plan: "abogado", tarjeta: "VISA •••• 4242" } });
    expect(r.status).toBe(200);
    expect(r.data.cobrado).toBe(false);
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].url).toContain("/payment_sources");
    expect(llamadas[0].opciones.headers.Authorization).toBe("Bearer prv_test_priv");
    expect(despacho).toMatchObject({ cobro_automatico: true, wompi_fuente_pago_id: "777", wompi_tarjeta: "VISA •••• 4242", plan: "abogado" });
  });

  it("si el plan está vencido, al activar el cobro automático cobra el primer mes con la tarjeta guardada", async () => {
    despacho.pagado_hasta = new Date(Date.now() - 86400000).toISOString();
    const llamadas = [];
    globalThis.fetch = vi.fn(async (url, opciones) => {
      llamadas.push({ url, body: opciones?.body ? JSON.parse(opciones.body) : null });
      if (url.endsWith("/payment_sources")) return { ok: true, json: async () => ({ data: { id: 778 } }) };
      return { ok: true, json: async () => ({ data: { id: "tx-auto", status: "PENDING" } }) };
    });
    const r = await llamar({ body: { accion: "wompi_activar_cobro", token: "tok_test", acceptanceToken: "acc", plan: "despacho" } });
    expect(r.data).toMatchObject({ cobrado: true, transaccionId: "tx-auto" });
    const cobro = llamadas.find((l) => l.url.endsWith("/transactions"));
    expect(cobro.body).toMatchObject({ amount_in_cents: 12000000, currency: "COP", payment_source_id: 778, recurrent: true });
    expect(cobro.body.signature).toBe(sha256(`${cobro.body.reference}12000000COPtest_integrity_123`));
  });

  it("un cobro rechazado queda anotado como error y no activa nada", async () => {
    const tx = { id: "tx-r", status: "DECLINED", status_message: "Fondos insuficientes", amount_in_cents: 12000000, currency: "COP", reference: `NOMOS_${DESPACHO}_despacho_1` };
    await llamar({ query: { wompi: "evento" }, body: evento(tx), headers: { authorization: "" } });
    expect(despacho.cobro_auto_error).toContain("rechazado");
    expect(despacho.activo).toBeUndefined();
  });
});
