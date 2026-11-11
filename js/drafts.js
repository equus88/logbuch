// Borradores de formularios: lo que escribes se guarda solo mientras registras,
// así puedes cerrar el formulario (para ver un video, cambiar de módulo o
// porque iOS cerró la app) y retomarlo donde ibas. Viven en la tabla meta.
import { db, getMeta, setMeta, del } from './db.js';

const PREFIX = 'borrador:';

export async function loadDraft(key) {
  return getMeta(PREFIX + key, null);
}
export async function clearDraft(key) {
  await del('meta', PREFIX + key);
}

// Guarda el registro que devuelve build() cada vez que cambia el formulario.
// Devuelve una función que indica si se llegó a guardar algo.
export function autosave(form, key, build) {
  let timer = null, saved = false;
  const save = async () => {
    try {
      await setMeta(PREFIX + key, { guardado: new Date().toISOString(), rec: build(new FormData(form)) });
      saved = true;
    } catch (e) { console.warn('No se pudo guardar el borrador', e); }
  };
  const schedule = () => { clearTimeout(timer); timer = setTimeout(save, 350); };
  form.addEventListener('input', schedule);
  form.addEventListener('change', schedule);
  form.addEventListener('click', (e) => { if (e.target.closest('[data-ex-del],[data-ex-add],[data-copy-last]')) schedule(); });
  // Al ocultarse la app (bloqueo, cambio de app) se guarda de inmediato
  const flush = () => { if (document.visibilityState === 'hidden') { clearTimeout(timer); save(); } };
  document.addEventListener('visibilitychange', flush);
  return {
    dirty: () => saved || timer != null,
    async flush() { clearTimeout(timer); timer = null; document.removeEventListener('visibilitychange', flush); },
    async saveNow() { clearTimeout(timer); timer = null; await save(); document.removeEventListener('visibilitychange', flush); },
  };
}

export const draftTime = (iso) => new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });

// Claves de los borradores abiertos (por ejemplo 'cuerpo:nuevo:2026-11-10')
export async function draftKeys() {
  const d = await db();
  const keys = await new Promise((res, rej) => { const r = d.transaction('meta').objectStore('meta').getAllKeys(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  return keys.filter((k) => String(k).startsWith(PREFIX)).map((k) => k.slice(PREFIX.length));
}
