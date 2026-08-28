// Registro de un despacho nuevo (self-service, sin necesitar un
// administrador previo). El usuario de Supabase Auth se crea del lado del
// navegador con supabase.auth.signUp() ANTES de llamar aquí — así Supabase
// envía el correo real de confirmación (esta función con service_role no
// puede disparar ese correo). Esta función solo crea el despacho y el
// perfil, verificando que el userId corresponda a un usuario real recién
// creado.
//
// Los demás usuarios de un despacho ya existente los crea su Administrador
// desde "Usuarios y permisos" (api/usuarios/crear.js), sin este paso de
// verificación de correo.

import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { permisosPorDefecto, notificacionesPorDefecto } from "../_lib/defaults.js";
import { dentroDelLimite } from "../_lib/rateLimit.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido" });
  }

  const { nombreDespacho, nombre, email, userId, sitioWeb, segundosLlenando } = req.body || {};
  if (!nombreDespacho?.trim() || !nombre?.trim() || !email?.trim() || !userId) {
    return res.status(400).json({ error: "Faltan datos" });
  }

  // Anti-spam: "sitioWeb" es un campo trampa invisible para personas (ver
  // LoginGate en el frontend) — si viene lleno, es casi seguro un bot. Y un
  // envío en menos de 1.5 segundos es demasiado rápido para que una persona
  // haya alcanzado a escribir el nombre del despacho a mano (el umbral es
  // bajo a propósito, para no rechazar por error a alguien que usa
  // autocompletado del navegador). En ambos casos se responde como si
  // hubiera funcionado (sin decirle al bot qué detectamos) pero no se crea
  // nada. Nota: la cuenta de Supabase Auth ya se creó del lado del
  // navegador antes de llegar aquí (es necesaria para el correo de
  // confirmación) — queda huérfana sin perfil ni despacho, sin acceso a
  // nada, un costo mínimo aceptable de esta protección gratuita.
  if (sitioWeb || (typeof segundosLlenando === "number" && segundosLlenando < 1.5)) {
    console.warn("Registro de despacho bloqueado por señales de spam");
    return res.status(200).json({ perfil: null, despacho: null });
  }

  const admin = supabaseAdmin();

  const puedeContinuar = await dentroDelLimite(admin, req, "despachos/crear", 5, 60);
  if (!puedeContinuar) {
    return res.status(429).json({ error: "Demasiados intentos. Espera un momento e inténtalo de nuevo." });
  }

  try {
    const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
    if (userError || !userData?.user || userData.user.email !== email.trim()) {
      return res.status(400).json({ error: "Usuario inválido" });
    }

    const { data: perfilExistente } = await admin.from("perfiles").select("id").eq("id", userId).maybeSingle();
    if (perfilExistente) {
      return res.status(400).json({ error: "Ya existe un despacho para esta cuenta." });
    }

    // Nace inactivo a propósito: queda pendiente de que el superadmin de la
    // plataforma lo active desde /api/plataforma/despachos.js, tras
    // coordinar el pago (ver PantallaPendienteActivacion en el frontend).
    const { data: despacho, error: despachoError } = await admin
      .from("despachos")
      .insert({ nombre: nombreDespacho.trim(), activo: false })
      .select()
      .single();
    if (despachoError) throw despachoError;

    const { data: perfil, error: perfilError } = await admin
      .from("perfiles")
      .insert({
        id: userId,
        nombre: nombre.trim(),
        email: email.trim(),
        rol: "Administrador",
        despacho_id: despacho.id,
        permisos: permisosPorDefecto("Administrador"),
        notificaciones: notificacionesPorDefecto(),
      })
      .select()
      .single();
    if (perfilError) {
      // Si falla el perfil, no dejamos el despacho huérfano.
      await admin.from("despachos").delete().eq("id", despacho.id);
      throw perfilError;
    }

    return res.status(200).json({ perfil, despacho });
  } catch (err) {
    console.error("Error creando despacho:", err);
    return res.status(400).json({ error: err.message || "No se pudo crear el despacho" });
  }
}
