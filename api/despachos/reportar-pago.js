// Pagos de la suscripción a Nomos (lo que cada despacho le paga a Nomos —
// NO los pagos de los clientes de un despacho).
//
// Este archivo atiende cuatro cosas, todas sobre el mismo pago, porque el
// plan Hobby de Vercel tiene un límite de 12 funciones sin servidor y ya se
// está justo en ese límite:
//
//   POST (sin "accion")            "Ya pagué" manual (Nequi/llave): deja
//                                   marcado despachos.pago_reportado_en para
//                                   que el superadmin revise y active a mano.
//   POST accion=wompi_checkout      Arma el link de pago de Wompi (Web
//                                   Checkout) para el plan elegido, con la
//                                   firma de integridad calculada aquí — el
//                                   navegador nunca ve el secreto ni puede
//                                   cambiar el valor.
//   POST accion=wompi_estado        Al volver de Wompi, consulta la
//                                   transacción y, si quedó aprobada, activa
//                                   el despacho (por si el aviso de Wompi
//                                   todavía no ha llegado).
//   POST ?wompi=evento              Aviso (webhook) que Wompi manda cuando
//                                   cambia una transacción — se verifica la
//                                   firma con el secreto de eventos antes de
//                                   creerle nada.
//   GET  ?wompi=config              Si los pagos en línea están configurados.
//
// Variables de entorno (Vercel → Settings → Environment Variables):
//   WOMPI_PUBLIC_KEY        pub_test_… / pub_prod_…
//   WOMPI_INTEGRITY_SECRET  test_integrity_… / prod_integrity_…
//   WOMPI_EVENTS_SECRET     test_events_… / prod_events_…
// La llave privada (prv_…) no hace falta para este flujo.

import crypto from "crypto";
import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { dentroDelLimite } from "../_lib/rateLimit.js";

// Precios de los planes en COP. Se fijan AQUÍ (servidor) y no se aceptan
// del navegador — si no, cualquiera podría pagar $1.000 y activar su plan.
// Deben coincidir con PLANES_PRECIO en src/App.jsx.
const PLANES = {
  abogado: { nombre: "Abogado", valor: 80000 },
  despacho: { nombre: "Despacho", valor: 120000 },
};

const sha256 = (texto) => crypto.createHash("sha256").update(texto, "utf8").digest("hex");

function configWompi() {
  const publica = process.env.WOMPI_PUBLIC_KEY || "";
  const integridad = process.env.WOMPI_INTEGRITY_SECRET || "";
  const eventos = process.env.WOMPI_EVENTS_SECRET || "";
  const pruebas = publica.startsWith("pub_test_");
  return {
    publica,
    integridad,
    eventos,
    pruebas,
    habilitado: !!(publica && integridad),
    api: pruebas ? "https://sandbox.wompi.co/v1" : "https://production.wompi.co/v1",
  };
}

// Referencia única por intento de pago, con lo necesario para saber a qué
// despacho y plan corresponde cuando Wompi avise: NOMOS_<despacho>_<plan>_<ms>.
const armarReferencia = (despachoId, plan) => `NOMOS_${despachoId}_${plan}_${Date.now()}`;
function leerReferencia(ref) {
  const m = /^NOMOS_([0-9a-f-]{36})_(abogado|despacho)_\d+$/i.exec(ref || "");
  return m ? { despachoId: m[1], plan: m[2].toLowerCase() } : null;
}

async function usuarioYDespacho(admin, req) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: userData, error } = await admin.auth.getUser(token);
  if (error || !userData?.user) return null;
  const { data: perfil } = await admin.from("perfiles").select("despacho_id").eq("id", userData.user.id).maybeSingle();
  if (!perfil?.despacho_id) return null;
  return { user: userData.user, despachoId: perfil.despacho_id };
}

// Aplica una transacción APROBADA: anota el pago en el historial de
// Plataforma y deja el despacho activo — lo mismo que hace el superadmin a
// mano. Es idempotente: si Wompi avisa dos veces (o el aviso y la consulta
// al volver llegan los dos), el pago se anota una sola vez gracias a la
// columna única wompi_transaccion_id.
async function aplicarTransaccion(admin, tx) {
  if (!tx || tx.status !== "APPROVED") return { aplicado: false, estado: tx?.status || "DESCONOCIDO" };
  const ref = leerReferencia(tx.reference);
  if (!ref) return { aplicado: false, estado: "REFERENCIA_AJENA" };
  const plan = PLANES[ref.plan];
  if (!plan || Number(tx.amount_in_cents) !== plan.valor * 100 || tx.currency !== "COP") {
    console.error("Wompi: monto o moneda no coinciden con el plan", tx.reference, tx.amount_in_cents, tx.currency);
    return { aplicado: false, estado: "MONTO_INVALIDO" };
  }

  const { data: existente } = await admin.from("plataforma_pagos").select("id").eq("wompi_transaccion_id", tx.id).maybeSingle();
  if (!existente) {
    const fecha = (tx.finalized_at || tx.created_at || new Date().toISOString()).slice(0, 10);
    const { error: errPago } = await admin.from("plataforma_pagos").insert({
      despacho_id: ref.despachoId,
      valor: plan.valor,
      fecha,
      wompi_transaccion_id: tx.id,
      metodo: `Wompi · ${tx.payment_method_type || "en línea"} · Plan ${plan.nombre}`,
    });
    // Choque con la columna única = otro aviso ya lo anotó; no es error.
    if (errPago && errPago.code !== "23505") throw errPago;
  }

  const { error: errDesp } = await admin
    .from("despachos")
    .update({ activo: true, prueba_hasta: null, pago_reportado_en: null })
    .eq("id", ref.despachoId);
  if (errDesp) throw errDesp;
  return { aplicado: true, estado: "APPROVED", despachoId: ref.despachoId };
}

async function consultarTransaccion(cfg, id) {
  const resp = await fetch(`${cfg.api}/transactions/${encodeURIComponent(id)}`);
  if (!resp.ok) return null;
  const json = await resp.json();
  return json?.data || null;
}

export default async function handler(req, res) {
  const admin = supabaseAdmin();
  const cfg = configWompi();

  // --- Configuración pública (sin sesión): solo dice si hay pagos en línea.
  if (req.method === "GET" && req.query?.wompi === "config") {
    return res.status(200).json({ habilitado: cfg.habilitado, pruebas: cfg.pruebas, planes: PLANES });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Método no permitido" });
  }

  // --- Aviso (webhook) de Wompi. No trae sesión: se confía SOLO si la firma
  // calculada con el secreto de eventos coincide.
  if (req.query?.wompi === "evento") {
    try {
      if (!cfg.eventos) return res.status(503).json({ error: "Secreto de eventos no configurado" });
      const evento = req.body || {};
      const props = evento?.signature?.properties || [];
      const valores = props
        .map((ruta) => ruta.split(".").reduce((obj, k) => (obj == null ? undefined : obj[k]), evento.data))
        .map((v) => (v == null ? "" : String(v)))
        .join("");
      const esperado = sha256(`${valores}${evento.timestamp}${cfg.eventos}`);
      const recibido = String(evento?.signature?.checksum || "").toLowerCase();
      if (!recibido || esperado.length !== recibido.length || !crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(recibido))) {
        console.error("Wompi: firma de evento inválida");
        return res.status(401).json({ error: "Firma inválida" });
      }
      if (evento.event === "transaction.updated") {
        await aplicarTransaccion(admin, evento.data?.transaction);
      }
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error("Wompi: error procesando evento", err);
      // 500 para que Wompi reintente más tarde.
      return res.status(500).json({ error: "Error procesando el evento" });
    }
  }

  const puedeContinuar = await dentroDelLimite(admin, req, "despachos/reportar-pago", 20, 60);
  if (!puedeContinuar) {
    return res.status(429).json({ error: "Demasiados intentos. Espera un momento e inténtalo de nuevo." });
  }

  try {
    const sesion = await usuarioYDespacho(admin, req);
    if (!sesion) return res.status(401).json({ error: "No autenticado" });
    const accion = req.body?.accion;

    // --- Link de pago de Wompi para el plan elegido.
    if (accion === "wompi_checkout") {
      if (!cfg.habilitado) return res.status(503).json({ error: "Los pagos en línea todavía no están configurados." });
      const planId = String(req.body?.plan || "").toLowerCase();
      const plan = PLANES[planId];
      if (!plan) return res.status(400).json({ error: "Plan no válido" });
      const referencia = armarReferencia(sesion.despachoId, planId);
      const centavos = plan.valor * 100;
      const firma = sha256(`${referencia}${centavos}COP${cfg.integridad}`);
      const origen = req.headers.origin || `https://${req.headers.host}`;
      const params = new URLSearchParams({
        "public-key": cfg.publica,
        currency: "COP",
        "amount-in-cents": String(centavos),
        reference: referencia,
        "signature:integrity": firma,
        "redirect-url": `${origen}/?pago=wompi`,
      });
      if (sesion.user.email) params.set("customer-data:email", sesion.user.email);
      return res.status(200).json({ url: `https://checkout.wompi.co/p/?${params.toString()}` });
    }

    // --- Al volver de Wompi: confirmar la transacción y activar si aplica.
    if (accion === "wompi_estado") {
      if (!cfg.habilitado) return res.status(503).json({ error: "Los pagos en línea todavía no están configurados." });
      const id = String(req.body?.id || "");
      if (!id) return res.status(400).json({ error: "Falta el id de la transacción" });
      const tx = await consultarTransaccion(cfg, id);
      if (!tx) return res.status(404).json({ error: "No se encontró la transacción en Wompi" });
      // Solo puede confirmar pagos de SU propio despacho.
      const ref = leerReferencia(tx.reference);
      if (!ref || ref.despachoId !== sesion.despachoId) return res.status(403).json({ error: "Esta transacción no es de tu despacho" });
      const resultado = await aplicarTransaccion(admin, tx);
      return res.status(200).json({ estado: tx.status, aplicado: resultado.aplicado });
    }

    // --- "Ya pagué" manual (Nequi / llave) — lo de siempre.
    const { error: updateError } = await admin
      .from("despachos")
      .update({ pago_reportado_en: new Date().toISOString() })
      .eq("id", sesion.despachoId);
    if (updateError) throw updateError;
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Error en pagos de suscripción:", err);
    return res.status(400).json({ error: err.message || "No se pudo procesar el pago." });
  }
}
