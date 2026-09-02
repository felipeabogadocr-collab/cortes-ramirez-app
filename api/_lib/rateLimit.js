// Límite de tasa (protección contra abuso/spam automatizado) para endpoints
// públicos o sensibles. Se apoya en una tabla de Supabase en vez de memoria
// del proceso, porque Vercel puede atender las solicitudes en varias
// instancias distintas y la memoria de una no la ve otra.

function obtenerIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return fwd.split(",")[0].trim();
  return req.socket?.remoteAddress || "desconocida";
}

// Devuelve true si la solicitud puede continuar, false si superó el límite.
// La "clave" puede ser una IP o cualquier otro identificador (ej. un
// despacho_id) — reutiliza la misma tabla, solo cambia qué se está contando.
export async function dentroDelLimitePorClave(admin, clave, ruta, maxIntentos, ventanaMinutos) {
  const desde = new Date(Date.now() - ventanaMinutos * 60 * 1000).toISOString();

  const { count, error } = await admin
    .from("limite_solicitudes")
    .select("id", { count: "exact", head: true })
    .eq("ruta", ruta)
    .eq("ip", clave)
    .gte("creado_en", desde);

  if (error) {
    // Si la tabla o la consulta falla, no bloqueamos al usuario real por un
    // problema nuestro: dejamos pasar la solicitud.
    console.error("Error verificando límite de tasa:", error);
    return true;
  }

  if ((count || 0) >= maxIntentos) return false;

  await admin.from("limite_solicitudes").insert({ ip: clave, ruta });

  // Limpieza oportunista de registros viejos, para que la tabla no crezca
  // indefinidamente (no es crítico que corra siempre, solo de vez en cuando).
  if (Math.random() < 0.05) {
    const haceUnDia = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    admin.from("limite_solicitudes").delete().lt("creado_en", haceUnDia).then(() => {}, () => {});
  }

  return true;
}

export async function dentroDelLimite(admin, req, ruta, maxIntentos, ventanaMinutos) {
  return dentroDelLimitePorClave(admin, obtenerIp(req), ruta, maxIntentos, ventanaMinutos);
}
