import { supabase } from "./supabaseClient";
import { queueSnapshot, getMirror, getPendingSnapshot, setMirror, queueIndexOp, getIndexOpsFor, esErrorDeConexion, sincronizarCola, contarPendientes, onCambioCola } from "./offlineQueue";

/**
 * Reemplazo de window.storage (solo disponible dentro de Claude.ai) por Supabase.
 * Mantiene la misma firma que el prototipo original (storageGet/storageSet con
 * claves tipo "cliente:ID", "indice-clientes", etc.) para no tener que tocar el
 * resto de la aplicación: solo cambia dónde vive el dato.
 *
 * Multi-despacho: cada fila de datos (menos "documentos", ver abajo) tiene una
 * columna despacho_id, y aquí se filtra siempre por el despacho del usuario
 * que inició sesión, para que un despacho nunca vea los datos de otro.
 */

let despachoActualId = null;
let despachoActualNombre = "";
export function setDespachoActual(id, nombre) {
  despachoActualId = id || null;
  despachoActualNombre = nombre || "";
}
export function getDespachoActualId() {
  return despachoActualId;
}

// Recibos de pago (imágenes generadas en canvas) --------------------------
// Antes se guardaban como texto base64 completo dentro de la fila del
// cliente en la base de datos — con cientos de pagos eso infla rápido el
// límite de espacio gratis de Supabase. Ahora se suben al bucket privado
// "recibos" (protegido por RLS: cada despacho solo puede leer su propia
// carpeta) y en el cliente solo se guarda la ruta del archivo, no la imagen.

export async function subirReciboImagen(clienteId, pagoId, blob) {
  if (!despachoActualId) throw new Error("Sin despacho activo");
  const ruta = `${despachoActualId}/${clienteId}/${pagoId}.png`;
  const { error } = await supabase.storage.from("recibos").upload(ruta, blob, { contentType: "image/png", upsert: true });
  if (error) throw error;
  return ruta;
}

export async function obtenerUrlReciboImagen(ruta) {
  if (!ruta) return null;
  const { data, error } = await supabase.storage.from("recibos").download(ruta);
  if (error) throw error;
  return URL.createObjectURL(data);
}

// Foto de perfil de un usuario — mismo patrón que los recibos: se sube al
// bucket "avatares" (aislado por despacho vía RLS) y en "perfiles" solo se
// guarda la ruta, nunca la imagen completa.
export async function subirFotoPerfil(usuarioId, blob) {
  if (!despachoActualId) throw new Error("Sin despacho activo");
  const extension = blob.type === "image/png" ? "png" : "jpg";
  const ruta = `${despachoActualId}/${usuarioId}.${extension}`;
  const { error } = await supabase.storage.from("avatares").upload(ruta, blob, { contentType: blob.type, upsert: true });
  if (error) throw error;
  return ruta;
}

export async function obtenerUrlFotoPerfil(ruta) {
  if (!ruta) return null;
  const { data, error } = await supabase.storage.from("avatares").download(ruta);
  if (error) throw error;
  return URL.createObjectURL(data);
}

// Para textos (PDFs, WhatsApp, recibos, etc.) que antes decían siempre
// "Cortés Ramírez Abogados" a mano: ahora usan el nombre del despacho de la
// sesión activa, para que la misma app sirva a cualquier despacho.
export function getNombreDespacho() {
  return despachoActualNombre || "tu despacho";
}

// "documento" es la excepción: el link de firma que reciben los clientes
// funciona sin iniciar sesión. Ese caso NO pasa por esta tabla genérica: se
// maneja aparte, más abajo, con funciones de base de datos que solo dejan
// leer/firmar UN documento puntual por su código (nunca listar la tabla
// completa). El índice de documentos (listado dentro de la app) sí se
// filtra por despacho, porque ese solo se usa autenticado.
const RECORD_TABLES = {
  cliente: { table: "clientes", filtrarDespacho: true },
};

const INDEX_TABLES = {
  "indice-clientes": "clientes",
  "indice-documentos": "documentos",
};

// Resumen (y otras pantallas) terminan pidiendo la misma lista completa de
// clientes/documentos/contenido más de una vez casi al mismo tiempo — cada
// hook (useDatosReportes, useResumenGeneral, PanelesDeNotificaciones, etc.)
// no sabe que otro ya está pidiendo exactamente lo mismo. En vez de
// reescribir cada hook para compartir un solo estado (un cambio mucho más
// grande y riesgoso), se coalescen aquí: si dos llamadas piden los mismos
// ids del mismo despacho mientras la primera todavía está en camino,
// comparten la misma respuesta en vez de mandar dos consultas idénticas a
// la base de datos. La caché se limpia apenas la consulta termina, así que
// nunca sirve un dato viejo — solo evita el duplicado cuando de verdad
// coinciden en el tiempo.
function coalescePorClave(cache, clave, tarea) {
  if (cache.clave === clave && cache.promesa) return cache.promesa;
  const promesa = tarea();
  cache.clave = clave;
  cache.promesa = promesa;
  promesa.finally(() => {
    if (cache.clave === clave) {
      cache.clave = null;
      cache.promesa = null;
    }
  });
  return promesa;
}

const cacheClientesPorId = { clave: null, promesa: null };
const cacheDocumentosPorId = { clave: null, promesa: null };
const cacheValoresPorClaves = { clave: null, promesa: null };

// Trae varios clientes de una sola vez (una sola consulta a la base de
// datos) en vez de uno por uno — antes, varias pantallas hacían
// storageGet("cliente:ID") en un ciclo por cada id del índice, y con N
// clientes eso eran N viajes de ida y vuelta al servidor, uno detrás de
// otro: con pocos clientes casi no se nota, pero entre más crece la lista
// del despacho, más lento se siente entrar a cada pestaña. Devuelve un
// objeto { [id]: datosDelCliente }, ya parseado (no hay que hacer
// JSON.parse después, a diferencia de storageGet).
export async function obtenerClientesPorId(ids) {
  if (!ids || ids.length === 0) return {};
  const clave = `${despachoActualId}:${[...ids].sort().join(",")}`;
  return coalescePorClave(cacheClientesPorId, clave, () => obtenerClientesPorIdInterno(ids));
}

async function obtenerClientesPorIdInterno(ids) {
  try {
    // Un solo IN() con miles de ids sería un problema aparte — se parte en
    // bloques para no mandar una sola consulta gigante si el despacho
    // llegara a tener una lista muy larga.
    const TAMANO_BLOQUE = 300;
    const resultado = {};
    for (let i = 0; i < ids.length; i += TAMANO_BLOQUE) {
      const bloque = ids.slice(i, i + TAMANO_BLOQUE);
      const { data, error } = await supabase
        .from("clientes")
        .select("id, data")
        .eq("despacho_id", despachoActualId)
        .in("id", bloque)
        .is("eliminado_en", null);
      if (error) throw error;
      (data || []).forEach((fila) => {
        resultado[fila.id] = fila.data;
        // Mismo esquema de clave que storageGet("cliente:ID") — para que
        // una lectura offline más tarde (ver más abajo) encuentre esto.
        setMirror(`cliente:${fila.id}`, JSON.stringify(fila.data));
      });
    }
    return resultado;
  } catch (e) {
    if (esErrorDeConexion(e)) return await obtenerClientesPorIdDesdeMirror(ids);
    console.warn("obtenerClientesPorId falló:", e);
    avisarErrorAlmacenamiento("get", "clientes (varios)", e);
    return {};
  }
}

// Sin conexión: arma lo mejor que se puede con lo último que se supo de
// cada cliente en este dispositivo — un cliente que nunca se haya visto
// aquí antes (por ejemplo, uno creado desde el celular de otra persona)
// no va a aparecer hasta que vuelva la señal, porque nunca se guardó una
// copia local de él.
async function obtenerClientesPorIdDesdeMirror(ids) {
  const resultado = {};
  for (const id of ids) {
    const raw = await getMirror(`cliente:${id}`);
    if (raw) resultado[id] = JSON.parse(raw);
  }
  return resultado;
}

// Mismo problema, misma solución, pero para documentos (usado en la
// pestaña Documentos, que también traía cada documento uno por uno).
export async function obtenerDocumentosPorId(ids) {
  if (!ids || ids.length === 0 || !despachoActualId) return {};
  const clave = `${despachoActualId}:${[...ids].sort().join(",")}`;
  return coalescePorClave(cacheDocumentosPorId, clave, () => obtenerDocumentosPorIdInterno(ids));
}

async function obtenerDocumentosPorIdInterno(ids) {
  try {
    const TAMANO_BLOQUE = 300;
    const resultado = {};
    for (let i = 0; i < ids.length; i += TAMANO_BLOQUE) {
      const bloque = ids.slice(i, i + TAMANO_BLOQUE);
      const { data, error } = await supabase
        .from("documentos")
        .select("id, data")
        .eq("despacho_id", despachoActualId)
        .in("id", bloque)
        .is("eliminado_en", null);
      if (error) throw error;
      (data || []).forEach((fila) => {
        resultado[fila.id] = fila.data;
        setMirror(`documento:${fila.id}`, JSON.stringify(fila.data));
      });
    }
    return resultado;
  } catch (e) {
    if (esErrorDeConexion(e)) {
      const resultado = {};
      for (const id of ids) {
        const raw = await getMirror(`documento:${id}`);
        if (raw) resultado[id] = JSON.parse(raw);
      }
      return resultado;
    }
    console.warn("obtenerDocumentosPorId falló:", e);
    avisarErrorAlmacenamiento("get", "documentos (varios)", e);
    return {};
  }
}

// Para claves genéricas de una sola tabla (app_settings) que se guardan una
// por elemento, como "contenido:ID" en el calendario de contenido — mismo
// problema (una consulta por elemento en un ciclo) resuelto igual, pero
// contra la tabla genérica en vez de "clientes"/"documentos". Devuelve un
// objeto { [clave]: valorSinParsear } (igual que storageGet, para que quien
// lo use siga haciendo JSON.parse si lo necesita).
export async function obtenerValoresPorClaves(claves) {
  if (!claves || claves.length === 0 || !despachoActualId) return {};
  const clave = `${despachoActualId}:${[...claves].sort().join(",")}`;
  return coalescePorClave(cacheValoresPorClaves, clave, () => obtenerValoresPorClavesInterno(claves));
}

async function obtenerValoresPorClavesInterno(claves) {
  try {
    const TAMANO_BLOQUE = 300;
    const resultado = {};
    for (let i = 0; i < claves.length; i += TAMANO_BLOQUE) {
      const bloque = claves.slice(i, i + TAMANO_BLOQUE);
      const { data, error } = await supabase
        .from("app_settings")
        .select("key, value")
        .eq("despacho_id", despachoActualId)
        .in("key", bloque);
      if (error) throw error;
      (data || []).forEach((fila) => {
        resultado[fila.key] = fila.value;
        setMirror(fila.key, fila.value);
      });
    }
    return resultado;
  } catch (e) {
    if (esErrorDeConexion(e)) {
      const resultado = {};
      for (const key of claves) {
        const raw = await getMirror(key);
        if (raw !== null && raw !== undefined) resultado[key] = raw;
      }
      return resultado;
    }
    console.warn("obtenerValoresPorClaves falló:", e);
    avisarErrorAlmacenamiento("get", "app_settings (varios)", e);
    return {};
  }
}

function parseRecordKey(key) {
  const idx = key.indexOf(":");
  if (idx === -1) return null;
  const prefix = key.slice(0, idx);
  const info = RECORD_TABLES[prefix];
  if (!info) return null;
  return { ...info, id: key.slice(idx + 1) };
}

// storageGet/storageSet atrapan sus propios errores para no tumbar la
// pantalla que los llama (ver los catch más abajo) — pero eso significa que
// si Supabase falla (sin internet, un corte breve, etc.) el resto de la app
// seguía como si nada, mostrando "se guardó correctamente" sobre un cambio
// que en realidad nunca llegó al servidor. Este evento avisa a quien esté
// escuchando (el aviso global en App.jsx) para que el usuario se entere de
// una vez, en vez de descubrirlo días después cuando el dato ya no está.
function avisarErrorAlmacenamiento(tipo, key, error) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("nomos:error-almacenamiento", { detail: { tipo, key, mensaje: error?.message || String(error) } }));
}

// Un corte breve de conexión (típico en celular, cambiando de wifi a datos,
// etc.) antes tumbaba la carga a la primera sin más — el usuario veía "no
// se pudieron cargar los datos" por algo que se resolvía solo medio segundo
// después. Ahora se reintenta una vez antes de darse por vencido y avisar.
async function conReintento(fn, key, tipo) {
  try {
    return await fn();
  } catch (e) {
    console.warn(`${tipo === "set" ? "storageSet" : "storageGet"} falló, reintentando una vez...`, key, e);
    await new Promise((resolve) => setTimeout(resolve, 700));
    try {
      return await fn();
    } catch (e2) {
      console.error(`${tipo === "set" ? "storageSet" : "storageGet"} error (tras reintento)`, key, e2);
      // Un error de CONEXIÓN ya no se avisa como "no se pudo guardar" — lo
      // maneja el modo offline (se guarda en la cola local y se sube
      // solo), así que ese aviso rojo ya no aplica y solo asustaría por
      // algo que en realidad sí quedó a salvo. Solo se avisa para errores
      // reales (por ejemplo, un permiso rechazado por la base de datos).
      if (!esErrorDeConexion(e2)) avisarErrorAlmacenamiento(tipo, key, e2);
      throw e2;
    }
  }
}

export async function storageGet(key) {
  try {
    const valor = await conReintento(() => storageGetInterno(key), key, "get");
    // Se guarda una copia para poder leerla si más tarde se pierde la
    // señal — la próxima vez que se pida esta misma clave sin conexión,
    // hay algo que mostrar en vez de una pantalla vacía.
    setMirror(key, valor);
    return valor;
  } catch (e) {
    if (!esErrorDeConexion(e)) return null;
    if (INDEX_TABLES[key]) return await reconstruirIndiceOffline(key);
    // Sin conexión: primero lo que se haya escrito offline y todavía no
    // se ha subido (lo más reciente que existe), y si no hay nada
    // pendiente, la última copia conocida de cuando sí hubo señal.
    const pendiente = await getPendingSnapshot(key);
    if (pendiente !== null) return pendiente;
    return await getMirror(key);
  }
}

// La lista de ids que se vería sin conexión: el último espejo conocido de
// esta misma consulta (de la última vez que sí hubo señal), con los
// cambios hechos offline aplicados encima — así un cliente creado sin
// conexión ya aparece en la lista antes incluso de sincronizar.
async function reconstruirIndiceOffline(indexKey) {
  const mirrorRaw = await getMirror(indexKey);
  const idsBase = mirrorRaw ? JSON.parse(mirrorRaw) : [];
  const ops = await getIndexOpsFor(indexKey);
  let ids = [...idsBase];
  for (const op of ops) {
    if (op.op === "add" && !ids.includes(op.id)) ids = [op.id, ...ids];
    else if (op.op === "remove") ids = ids.filter((x) => x !== op.id);
  }
  return JSON.stringify(ids);
}

async function storageGetInterno(key) {
    if (INDEX_TABLES[key]) {
      const table = INDEX_TABLES[key];
      const { data, error } = await supabase
        .from(table)
        .select("id")
        .eq("despacho_id", despachoActualId)
        .is("eliminado_en", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return JSON.stringify((data || []).map((r) => r.id));
    }

    if (key.startsWith("chat-asistente:")) {
      const { data, error } = await supabase
        .from("chats")
        .select("value")
        .eq("despacho_id", despachoActualId)
        .eq("id", key)
        .maybeSingle();
      if (error) throw error;
      return data ? data.value : null;
    }

    if (key.startsWith("documento:")) {
      const id = key.slice("documento:".length);
      if (despachoActualId) {
        const { data, error } = await supabase
          .from("documentos")
          .select("data")
          .eq("id", id)
          .eq("despacho_id", despachoActualId)
          .is("eliminado_en", null)
          .maybeSingle();
        if (error) throw error;
        return data ? JSON.stringify(data.data) : null;
      }
      // Sin sesión (cliente firmando): solo este documento puntual, vía función segura.
      const { data, error } = await supabase.rpc("obtener_documento_publico", { p_id: id });
      if (error) throw error;
      return data ? JSON.stringify(data) : null;
    }

    const record = parseRecordKey(key);
    if (record) {
      let query = supabase.from(record.table).select("data").eq("id", record.id);
      if (record.filtrarDespacho) query = query.eq("despacho_id", despachoActualId);
      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      return data ? JSON.stringify(data.data) : null;
    }

    // Ajustes simples de una sola clave: preferencia-tema, perfil-abogado,
    // ultima-revision-firmas, estrategia-contenido, indice-contenido, etc.
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("despacho_id", despachoActualId)
      .eq("key", key)
      .maybeSingle();
    if (error) throw error;
    return data ? data.value : null;
}

async function syncIndexTable(table, newIds) {
  const { data, error } = await supabase.from(table).select("id").eq("despacho_id", despachoActualId).is("eliminado_en", null);
  if (error) throw error;
  const currentIds = (data || []).map((r) => r.id);
  const toDelete = currentIds.filter((id) => !newIds.includes(id));
  if (toDelete.length > 0) {
    // Borrado suave: se marca con fecha en vez de borrarse de una, para
    // poder recuperarlo desde la Papelera si fue un error.
    const { error: delError } = await supabase
      .from(table)
      .update({ eliminado_en: new Date().toISOString() })
      .eq("despacho_id", despachoActualId)
      .in("id", toDelete);
    if (delError) throw delError;
  }
}

// Papelera --------------------------------------------------------------
// Los tres tipos de registro que se pueden "eliminar" desde la app en
// realidad solo se marcan con eliminado_en (ver syncIndexTable arriba).
// Estas funciones permiten verlos, recuperarlos o borrarlos para siempre.

const TABLAS_PAPELERA = { clientes: "clientes", documentos: "documentos" };

export async function obtenerPapelera(tipo) {
  const table = TABLAS_PAPELERA[tipo];
  if (!table || !despachoActualId) return [];
  const { data, error } = await supabase
    .from(table)
    .select("id, data, eliminado_en")
    .eq("despacho_id", despachoActualId)
    .not("eliminado_en", "is", null)
    .order("eliminado_en", { ascending: false });
  if (error) {
    console.error("obtenerPapelera error", tipo, error);
    return [];
  }
  return data || [];
}

export async function restaurarDePapelera(tipo, id) {
  const table = TABLAS_PAPELERA[tipo];
  if (!table) return false;
  const { error } = await supabase.from(table).update({ eliminado_en: null }).eq("despacho_id", despachoActualId).eq("id", id);
  return !error;
}

export async function eliminarDefinitivo(tipo, id) {
  const table = TABLAS_PAPELERA[tipo];
  if (!table) return false;
  const { error } = await supabase.from(table).delete().eq("despacho_id", despachoActualId).eq("id", id);
  return !error;
}

// Firma pública de documentos ----------------------------------------------
// Cuando firma alguien SIN sesión (el cliente, desde #firmar), no se escribe
// directo a Supabase desde el navegador: pasa por esta función serverless
// para poder registrar la IP real de quien firmó (ver api/documentos/firmar.js).

export async function firmarDocumentoPublico(id, data) {
  const response = await fetch("/api/documentos/firmar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codigo: id, data }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || "No se pudo guardar la firma");
  return json;
}

// Cadena de custodia de la firma electrónica: registra "documento_visualizado"
// (el firmante abrió el documento) y "consentimiento_aceptado" (aceptó la
// casilla ANTES de firmar, como evento propio con su propio timestamp,
// separado de la firma en sí). El evento "documento_firmado" lo registra el
// propio servidor dentro de firmarDocumentoPublico, no aquí. Es informativo
// (no bloquea el flujo de firma si falla): si el firmante no tiene señal un
// instante, no tiene sentido impedirle firmar por eso.
export async function registrarEventoDocumentoPublico(id, tipoEvento, extra) {
  try {
    await fetch("/api/documentos/firmar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo: id, tipoEvento, ...extra }),
    });
  } catch (e) {
    console.warn("No se pudo registrar el evento de auditoría:", e);
  }
}

// Mismo registro, pero para cuando quien firma es el abogado DENTRO de la
// app (con sesión) — no pasa por el servidor porque no hace falta capturar
// la IP de una acción ya autenticada de la misma forma (la sesión de
// Supabase ya identifica quién es); se inserta directo, igual que el resto
// de la auditoría del despacho.
export async function registrarEventoDocumentoDespacho(id, tipoEvento, detalle) {
  if (!despachoActualId) return;
  try {
    await supabase.from("documento_eventos").insert({
      despacho_id: despachoActualId,
      documento_id: id,
      tipo_evento: tipoEvento,
      firmante_nombre: detalle?.firmante_nombre || null,
      firmante_documento_id: detalle?.firmante_documento_id || null,
      rol: detalle?.rol || null,
      hash_documento: detalle?.hash_documento || null,
      detalle: detalle?.detalle || null,
    });
  } catch (e) {
    console.warn("No se pudo registrar el evento de auditoría:", e);
  }
}

// Trae el log de auditoría completo de un documento (para exportarlo) — solo
// lo puede leer alguien autenticado del mismo despacho (RLS), ordenado
// cronológicamente como pide la cadena de custodia.
export async function obtenerEventosDocumento(id) {
  if (!despachoActualId) return [];
  const { data, error } = await supabase
    .from("documento_eventos")
    .select("tipo_evento, firmante_nombre, firmante_documento_id, rol, ip, user_agent, hash_documento, creado_en")
    .eq("despacho_id", despachoActualId)
    .eq("documento_id", id)
    .order("creado_en", { ascending: true });
  if (error) {
    console.warn("No se pudo leer el log de auditoría:", error);
    return [];
  }
  return data || [];
}

// Búsqueda global ---------------------------------------------------------

export async function buscarGlobal(texto) {
  const consulta = (texto || "").trim();
  if (!despachoActualId || consulta.length < 2) return [];
  const patron = `%${consulta}%`;
  const [clientesRes, documentosRes] = await Promise.all([
    supabase.from("clientes").select("id, data").eq("despacho_id", despachoActualId).is("eliminado_en", null).ilike("data->>nombre", patron).limit(6),
    supabase.from("documentos").select("id, data").eq("despacho_id", despachoActualId).is("eliminado_en", null).ilike("data->>titulo", patron).limit(6),
  ]);
  const clientes = (clientesRes.data || []).map((r) => ({ tipo: "cliente", id: r.id, titulo: r.data?.nombre || "(sin nombre)" }));
  const documentos = (documentosRes.data || []).map((r) => ({ tipo: "documento", id: r.id, titulo: r.data?.titulo || "(sin título)" }));
  return [...clientes, ...documentos];
}

export async function storageSet(key, value) {
  try {
    const ok = await conReintento(() => storageSetInterno(key, value), key, "set");
    setMirror(key, value);
    return ok;
  } catch (e) {
    if (!esErrorDeConexion(e)) return false;
    if (INDEX_TABLES[key]) {
      await encolarCambioDeIndiceOffline(key, value);
    } else {
      await queueSnapshot(key, value);
    }
    // Se devuelve como si hubiera funcionado: el dato ya quedó a salvo en
    // este dispositivo (IndexedDB) y se sube solo apenas vuelva la señal —
    // que la pantalla avise "no se pudo guardar" aquí sería falso y
    // confundiría más de lo que ayuda.
    return true;
  }
}

// "indice-clientes"/"indice-documentos" no son una lista guardada aparte:
// son la tabla real de clientes/documentos consultada y comparada contra
// lo que se le pasa para decidir qué marcar como borrado (ver
// syncIndexTable). Repetir esa comparación completa tal cual se veía
// offline, más tarde, podría borrar algo que otro dispositivo agregó
// mientras este no tenía señal — así que en vez de guardar la lista
// entera, se guarda solo QUÉ cambió puntualmente (qué id se agregó o se
// quitó), para aplicarlo sobre la lista real del servidor al sincronizar.
async function encolarCambioDeIndiceOffline(key, value) {
  const nuevosIds = value ? JSON.parse(value) : [];
  const mirrorRaw = await getMirror(key);
  const idsAntes = mirrorRaw ? JSON.parse(mirrorRaw) : [];
  const agregados = nuevosIds.filter((id) => !idsAntes.includes(id));
  const quitados = idsAntes.filter((id) => !nuevosIds.includes(id));
  for (const id of agregados) await queueIndexOp(key, "add", id);
  for (const id of quitados) await queueIndexOp(key, "remove", id);
  await setMirror(key, value);
}

// Los reintentos son seguros aquí porque todas las escrituras son upsert
// por id (o el patrón de borrado suave de syncIndexTable): repetir el mismo
// envío no duplica nada, en el peor caso sobreescribe con el mismo valor.
async function storageSetInterno(key, value) {
    if (INDEX_TABLES[key]) {
      const ids = value ? JSON.parse(value) : [];
      await syncIndexTable(INDEX_TABLES[key], ids);
      return true;
    }

    if (key.startsWith("chat-asistente:")) {
      const { error } = await supabase
        .from("chats")
        .upsert({ id: key, despacho_id: despachoActualId, value, updated_at: new Date().toISOString() });
      if (error) throw error;
      return true;
    }

    if (key.startsWith("documento:")) {
      // Sin sesión (cliente firmando #firmar) no pasa por aquí: usa
      // firmarDocumentoPublico(), que sí captura la IP en el servidor.
      const id = key.slice("documento:".length);
      const parsed = JSON.parse(value);
      const { error } = await supabase
        .from("documentos")
        .upsert({ id, despacho_id: despachoActualId, data: parsed, updated_at: new Date().toISOString() });
      if (error) throw error;
      return true;
    }

    const record = parseRecordKey(key);
    if (record) {
      const parsed = JSON.parse(value);
      const row = {
        id: record.id,
        data: parsed,
        updated_at: new Date().toISOString(),
        despacho_id: despachoActualId,
      };
      const { error } = await supabase.from(record.table).upsert(row);
      if (error) throw error;
      return true;
    }

    const { error } = await supabase
      .from("app_settings")
      .upsert({ key, despacho_id: despachoActualId, value, updated_at: new Date().toISOString() });
    if (error) throw error;
    return true;
}

// Modo offline ------------------------------------------------------------
// Todo lo que se guarda sin conexión (ver storageSet más arriba) queda en
// una cola local en IndexedDB. Esto es lo que la vacía apenas hay señal, y
// lo que deja mostrar en pantalla "sin conexión, N cambios sin subir".

export function cambiosSinSincronizar(fn) {
  return onCambioCola(fn);
}

export async function contarCambiosSinSincronizar() {
  return contarPendientes();
}

async function aplicarIndexOpPendiente(indexKey, op, id) {
  if (op !== "remove") return; // "add" no necesita nada aparte: el propio registro (cliente:ID/documento:ID) ya lo hace aparecer
  const table = INDEX_TABLES[indexKey];
  const { error } = await supabase.from(table).update({ eliminado_en: new Date().toISOString() }).eq("despacho_id", despachoActualId).eq("id", id);
  if (error) throw error;
}

export async function sincronizarCambiosPendientes() {
  if (!despachoActualId) return; // sin sesión activa todavía, nada que sincronizar
  await sincronizarCola({
    aplicarSnapshot: (key, value) => storageSetInterno(key, value),
    aplicarIndexOp: aplicarIndexOpPendiente,
  });
}

let sincronizacionIniciada = false;
// Se llama una sola vez (desde App.jsx, al iniciar sesión) — intenta subir
// lo pendiente apenas vuelve la conexión, y de vez en cuando por si el
// evento "online" del navegador no se dispara (pasa a veces al volver de
// modo avión o cambiar de wifi a datos).
export function iniciarSincronizacionOffline() {
  if (sincronizacionIniciada || typeof window === "undefined") return;
  sincronizacionIniciada = true;
  window.addEventListener("online", () => sincronizarCambiosPendientes());
  sincronizarCambiosPendientes();
  setInterval(() => {
    if (navigator.onLine) sincronizarCambiosPendientes();
  }, 30000);
}
