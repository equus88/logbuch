// Capa de datos: IndexedDB con migraciones versionadas.
//
// Regla de oro: los datos viven en el teléfono, ligados a la URL de la app.
// Actualizar el código NO borra nada. Lo único que puede romper los datos es
// cambiar su estructura sin una migración, así que:
//   1. Nunca edites una migración que ya publicaste.
//   2. Para cambiar la estructura, sube SCHEMA_VERSION en version.js y agrega
//      la migración con ese número en MIGRATIONS.
//   3. Antes de migrar, la app guarda una copia de seguridad automática.

import { SCHEMA_VERSION } from './version.js';

const DB_NAME = 'logbuch';
// Almacenes de registros con fecha (los que cuentan como "datos" del usuario)
export const STORES = ['cuerpo', 'idiomas', 'carrera', 'ofertas', 'finanzas'];
const MAX_BACKUPS = 5;

// Cada migración recibe la base y la transacción de actualización.
// Puede crear almacenes, índices o transformar registros existentes.
// Cada migración usa listas literales: nunca depende de constantes que
// puedan cambiar en versiones futuras (como STORES).
const MIGRATIONS = {
  // v1.0.0
  1: (db) => {
    for (const name of ['cuerpo', 'idiomas', 'carrera', 'ofertas', 'finanzas']) {
      const s = db.createObjectStore(name, { keyPath: 'id' });
      s.createIndex('fecha', 'fecha');
    }
    db.createObjectStore('meta', { keyPath: 'key' });
    db.createObjectStore('backups', { keyPath: 'id' });
  },
  // v1.1.0: planes de entrenamiento y estudio, con historial de versiones
  2: (db) => {
    const s = db.createObjectStore('planes', { keyPath: 'id' });
    s.createIndex('area', 'area');
  },
};

// Transformaciones de registros por versión de esquema. Son funciones puras:
// se aplican a la base al migrar y también a copias viejas al restaurarlas,
// así una copia del esquema 1 sigue sirviendo cuando la app esté en el 3.
// Ejemplo: 2: { idiomas: (r) => ({ ...r, nivel: r.nivel ?? null }) },
const RECORD_UPGRADES = {
};

function upgradeRecordsInDB(tx, v) {
  const per = RECORD_UPGRADES[v] || {};
  for (const [store, fn] of Object.entries(per)) {
    tx.objectStore(store).openCursor().onsuccess = (e) => {
      const c = e.target.result; if (!c) return;
      c.update(fn(c.value));
      c.continue();
    };
  }
}

export function upgradeDump(data, fromSchema) {
  const out = { ...data };
  for (let v = fromSchema + 1; v <= SCHEMA_VERSION; v++) {
    for (const [store, fn] of Object.entries(RECORD_UPGRADES[v] || {})) {
      if (out[store]) out[store] = out[store].map(fn);
    }
  }
  return out;
}

let dbPromise = null;

function req(r) {
  return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
function txDone(tx) {
  return new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
}

// Abre la base sin versión para saber si existe y en qué versión está.
// Si no existe, aborta para no crearla vacía.
function probe() {
  return new Promise((resolve) => {
    const r = indexedDB.open(DB_NAME);
    r.onupgradeneeded = () => { r.transaction.abort(); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => resolve(null);
  });
}

async function dumpWith(db) {
  const names = [...db.objectStoreNames].filter((n) => n !== 'backups');
  const tx = db.transaction(names, 'readonly');
  const out = {};
  for (const n of names) out[n] = await req(tx.objectStore(n).getAll());
  return out;
}

async function writeBackup(db, reason, data) {
  const tx = db.transaction('backups', 'readwrite');
  const s = tx.objectStore('backups');
  s.put({ id: new Date().toISOString(), reason, schema: db.version, data });
  const keys = await req(s.getAllKeys());
  keys.sort();
  while (keys.length > MAX_BACKUPS) s.delete(keys.shift());
  await txDone(tx);
}

async function openDB() {
  // Copia de seguridad antes de migrar a un esquema nuevo
  const old = await probe();
  if (old) {
    if (old.version < SCHEMA_VERSION && old.objectStoreNames.contains('backups')) {
      try { await writeBackup(old, `Antes de migrar del esquema ${old.version} al ${SCHEMA_VERSION}`, await dumpWith(old)); }
      catch (e) { console.warn('No se pudo crear la copia previa a la migración', e); }
    }
    old.close();
  }
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, SCHEMA_VERSION);
    r.onupgradeneeded = (e) => {
      const db = r.result, tx = r.transaction;
      for (let v = e.oldVersion + 1; v <= SCHEMA_VERSION; v++) {
        if (!MIGRATIONS[v]) throw new Error(`Falta la migración ${v}`);
        MIGRATIONS[v](db, tx);
        upgradeRecordsInDB(tx, v);
      }
    };
    r.onsuccess = () => {
      const db = r.result;
      // Si otra pestaña abre una versión más nueva, cerramos para no bloquearla
      db.onversionchange = () => { db.close(); location.reload(); };
      resolve(db);
    };
    r.onerror = () => reject(r.error);
    r.onblocked = () => alert('Cierra otras pestañas de Logbuch para terminar la actualización.');
  });
}

export function db() { return dbPromise || (dbPromise = openDB()); }

export async function all(store) {
  const d = await db();
  const rows = await req(d.transaction(store).objectStore(store).getAll());
  return rows.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : (b.creado || '').localeCompare(a.creado || '')));
}
export async function get(store, id) {
  const d = await db();
  return req(d.transaction(store).objectStore(store).get(id));
}
export async function put(store, obj) {
  const d = await db();
  const tx = d.transaction(store, 'readwrite');
  tx.objectStore(store).put(obj);
  await txDone(tx);
  return obj;
}
export async function del(store, id) {
  const d = await db();
  const tx = d.transaction(store, 'readwrite');
  tx.objectStore(store).delete(id);
  await txDone(tx);
}
export async function getMeta(key, fallback = null) {
  const r = await get('meta', key);
  return r ? r.value : fallback;
}
export async function setMeta(key, value) {
  return put('meta', { key, value });
}

export async function dumpAll() {
  return dumpWith(await db());
}
export async function backup(reason) {
  const d = await db();
  return writeBackup(d, reason, await dumpWith(d));
}
export async function listBackups() {
  const d = await db();
  const rows = await req(d.transaction('backups').objectStore('backups').getAll());
  return rows.sort((a, b) => b.id.localeCompare(a.id));
}

// Reemplaza todo el contenido con el de una copia (formato de dumpAll).
// fromSchema: versión de esquema de la copia; se actualizan sus registros si es vieja.
export async function restoreAll(raw, fromSchema = SCHEMA_VERSION) {
  const data = upgradeDump(raw, fromSchema);
  const d = await db();
  const names = [...d.objectStoreNames].filter((n) => n !== 'backups' && data[n]);
  const tx = d.transaction(names, 'readwrite');
  for (const n of names) {
    const s = tx.objectStore(n);
    s.clear();
    for (const row of data[n]) s.put(row);
  }
  await txDone(tx);
}

export async function wipe() {
  const d = await db();
  const names = [...d.objectStoreNames].filter((n) => n !== 'backups');
  const tx = d.transaction(names, 'readwrite');
  for (const n of names) tx.objectStore(n).clear();
  await txDone(tx);
}

export async function hasData() {
  const d = await db();
  const tx = d.transaction(STORES);
  for (const n of STORES) if ((await req(tx.objectStore(n).count())) > 0) return true;
  return false;
}
