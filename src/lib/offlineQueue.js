// Cola de escrituras pendientes + espejo local, para poder seguir
// trabajando (crear/editar clientes, registrar pagos, etc.) sin conexión y
// que se suba solo apenas vuelva el wifi/datos. Todo vive en IndexedDB
// (sobrevive a cerrar la pestaña, a diferencia de una variable en memoria).
//
// Dos cosas se guardan por separado, porque no es seguro tratarlas igual:
//
// - "snapshots": el valor completo de UNA clave puntual (cliente:ID,
//   documento:ID, egresos-contabilidad, perfil-abogado, etc.). Estas son
//   seguras de repetir sin orden estricto: la última que se aplique gana,
//   y no le pisa nada a nadie más porque cada clave es dueña de sus datos.
//
// - "indexOps": un solo cambio puntual (agregar o quitar UN id) sobre
//   "indice-clientes" / "indice-documentos". A diferencia de un snapshot,
//   estas dos claves en realidad representan una LISTA completa comparada
//   contra el servidor para decidir qué borrar — si se guardara offline la
//   lista completa tal como se veía en este dispositivo y se reintentara
//   tal cual más tarde, podría borrar (soft-delete) algo que otro
//   dispositivo agregó mientras este estaba sin conexión. Guardando solo
//   la operación puntual ("agregué X" / "quité Y") se puede aplicar sobre
//   la lista real del servidor en el momento de sincronizar, sin importar
//   qué haya cambiado mientras tanto.

const DB_NAME = "nomos-offline";
const DB_VERSION = 1;
const STORE_SNAPSHOTS = "snapshots"; // key: clave de storage -> { value, ts }
const STORE_MIRROR = "mirror"; // key: clave de storage -> { value, ts } (última lectura/escritura conocida, para leer offline)
const STORE_INDEX_OPS = "indexOps"; // autoincrement -> { indexKey, op: "add"|"remove", id, ts }

let dbPromise = null;
function abrirDB() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) db.createObjectStore(STORE_SNAPSHOTS);
      if (!db.objectStoreNames.contains(STORE_MIRROR)) db.createObjectStore(STORE_MIRROR);
      if (!db.objectStoreNames.contains(STORE_INDEX_OPS)) db.createObjectStore(STORE_INDEX_OPS, { autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    // Si IndexedDB falla por lo que sea (modo privado muy estricto, etc.),
    // el resto de la app sigue funcionando igual — solo sin cola offline.
    req.onerror = () => resolve(null);
  });
  return dbPromise;
}

// Ejecuta fn(store) dentro de una transacción y resuelve cuando termina —
// solo para escrituras simples (put/add/delete) que no necesitan leer un
// resultado de vuelta; las lecturas se hacen aparte, directo con su propio
// request (ver getMirror, getPendingSnapshot, etc.).
async function conTienda(nombre, modo, fn) {
  const db = await abrirDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(nombre, modo);
      fn(tx.objectStore(nombre));
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch (e) {
      resolve();
    }
  });
}

// --- Espejo local (para leer offline lo último que se supo de una clave) ---

export async function setMirror(key, value) {
  await conTienda(STORE_MIRROR, "readwrite", (store) => {
    store.put({ value, ts: Date.now() }, key);
    return {};
  });
}

export async function getMirror(key) {
  const db = await abrirDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_MIRROR, "readonly");
      const req = tx.objectStore(STORE_MIRROR).get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

// --- Snapshots pendientes (una clave -> su último valor sin sincronizar) ---

export async function queueSnapshot(key, value) {
  await conTienda(STORE_SNAPSHOTS, "readwrite", (store) => {
    store.put({ value, ts: Date.now() }, key);
    return {};
  });
  await setMirror(key, value);
  avisarCambioCola();
}

export async function getPendingSnapshot(key) {
  const db = await abrirDB();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_SNAPSHOTS, "readonly");
      const req = tx.objectStore(STORE_SNAPSHOTS).get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

async function todosLosSnapshots() {
  const db = await abrirDB();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_SNAPSHOTS, "readonly");
      const store = tx.objectStore(STORE_SNAPSHOTS);
      const entradas = [];
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          entradas.push({ key: cursor.key, value: cursor.value.value });
          cursor.continue();
        } else {
          resolve(entradas);
        }
      };
      req.onerror = () => resolve([]);
    } catch (e) {
      resolve([]);
    }
  });
}

async function borrarSnapshot(key) {
  await conTienda(STORE_SNAPSHOTS, "readwrite", (store) => {
    store.delete(key);
    return {};
  });
}

// --- Operaciones puntuales sobre índices (agregar/quitar un id) ---

export async function queueIndexOp(indexKey, op, id) {
  await conTienda(STORE_INDEX_OPS, "readwrite", (store) => {
    store.add({ indexKey, op, id, ts: Date.now() });
    return {};
  });
  avisarCambioCola();
}

async function todasLasIndexOps() {
  const db = await abrirDB();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_INDEX_OPS, "readonly");
      const store = tx.objectStore(STORE_INDEX_OPS);
      const entradas = [];
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          entradas.push({ claveDb: cursor.primaryKey, ...cursor.value });
          cursor.continue();
        } else {
          resolve(entradas);
        }
      };
      req.onerror = () => resolve([]);
    } catch (e) {
      resolve([]);
    }
  });
}

// Para reconstruir en pantalla, sin conexión, cómo debería verse la lista
// de ids ahora mismo: el último espejo conocido, con los cambios hechos
// offline (que todavía no llegaron al servidor) aplicados encima.
export async function getIndexOpsFor(indexKey) {
  const todas = await todasLasIndexOps();
  return todas.filter((o) => o.indexKey === indexKey);
}

async function borrarIndexOp(claveDb) {
  await conTienda(STORE_INDEX_OPS, "readwrite", (store) => {
    store.delete(claveDb);
    return {};
  });
}

// --- Estado (para el indicador "sin conexión / N cambios pendientes") ---

const listeners = new Set();
export function onCambioCola(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function avisarCambioCola() {
  listeners.forEach((fn) => fn());
}

export async function contarPendientes() {
  const [snaps, ops] = await Promise.all([todosLosSnapshots(), todasLasIndexOps()]);
  return snaps.length + ops.length;
}

// --- Detectar si algo falló por conexión (y no por un error real de la
// consulta, que sí debe mostrarse como error en vez de guardarse en cola
// para reintentar en silencio para siempre) ---
export function esErrorDeConexion(e) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = (e?.message || "").toLowerCase();
  return e instanceof TypeError || msg.includes("failed to fetch") || msg.includes("network") || msg.includes("load failed");
}

// --- Sincronizar: vacía la cola aplicando cada entrada contra el
// servidor. Si una entrada falla (todavía sin señal, o un error real),
// se detiene ahí y deja el resto en cola para el próximo intento — nunca
// se salta una entrada a mitad de camino para no perder el orden.
let sincronizando = false;
export async function sincronizarCola({ aplicarSnapshot, aplicarIndexOp }) {
  if (sincronizando) return;
  sincronizando = true;
  try {
    const snaps = await todosLosSnapshots();
    for (const s of snaps) {
      try {
        await aplicarSnapshot(s.key, s.value);
        await borrarSnapshot(s.key);
        avisarCambioCola();
      } catch (e) {
        if (esErrorDeConexion(e)) return; // seguimos sin señal, se reintenta después
        // Error real (no de red): se deja en cola iguial, pero no
        // tiene sentido seguir intentando las demás en este ciclo.
        return;
      }
    }
    const ops = await todasLasIndexOps();
    for (const o of ops) {
      try {
        await aplicarIndexOp(o.indexKey, o.op, o.id);
        await borrarIndexOp(o.claveDb);
        avisarCambioCola();
      } catch (e) {
        if (esErrorDeConexion(e)) return;
        return;
      }
    }
  } finally {
    sincronizando = false;
  }
}
