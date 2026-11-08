// Arranque: enrutador por hash, registro del service worker y avisos de actualización.
import { db, hasData, backup, getMeta, setMeta } from './db.js';
import { APP_VERSION } from './version.js';
import { toast } from './util.js';
import * as hoy from './modules/hoy.js';
import * as cuerpo from './modules/cuerpo.js';
import * as idiomas from './modules/idiomas.js';
import * as carrera from './modules/carrera.js';
import * as finanzas from './modules/finanzas.js';
import * as datos from './modules/datos.js';

// Para agregar un módulo: crea js/modules/<nombre>.js con render(root, app),
// agrégalo aquí y en la barra de index.html, y súmalo a la lista de sw.js.
const ROUTES = {
  hoy: { title: 'Hoy', mod: hoy },
  cuerpo: { title: 'Cuerpo', mod: cuerpo },
  idiomas: { title: 'Idiomas', mod: idiomas },
  carrera: { title: 'Carrera', mod: carrera },
  finanzas: { title: 'Finanzas', mod: finanzas },
  datos: { title: 'Datos', mod: datos },
};

const main = document.getElementById('view');
const titleEl = document.getElementById('title');
let swReg = null;

const app = {
  async refresh() {
    const key = (location.hash.match(/^#\/(\w+)/) || [])[1] || 'hoy';
    const r = ROUTES[key] || ROUTES.hoy;
    titleEl.textContent = r.title;
    document.querySelectorAll('[data-nav]').forEach((a) => a.setAttribute('aria-current', a.dataset.nav === key ? 'page' : 'false'));
    const y = key === app._last ? scrollY : 0;
    app._last = key;
    try { await r.mod.render(main, app); }
    catch (e) { console.error(e); main.innerHTML = `<p class="empty">Algo falló al mostrar esta sección: ${e.message}</p>`; }
    scrollTo(0, y);
  },
  async checkUpdate() {
    if (!swReg) return false;
    await swReg.update();
    if (swReg.waiting) { showUpdate(swReg.waiting); return true; }
    return false;
  },
};

function showUpdate(worker) {
  const bar = document.getElementById('update');
  bar.hidden = false;
  bar.querySelector('button').onclick = () => {
    bar.querySelector('button').disabled = true;
    worker.postMessage('SKIP_WAITING');
  };
}

async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    swReg = await navigator.serviceWorker.register('./sw.js');
    if (swReg.waiting && navigator.serviceWorker.controller) showUpdate(swReg.waiting);
    swReg.addEventListener('updatefound', () => {
      const w = swReg.installing;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) showUpdate(w);
      });
    });
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
    // Al volver a la app, busca versiones nuevas
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') swReg.update().catch(() => {}); });
  } catch (e) { console.warn('Service worker no registrado', e); }
}

async function boot() {
  await db();
  // Pide almacenamiento persistente para que iOS no borre los datos por falta de espacio
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  // Copia automática la primera vez que corre una versión nueva del código
  const last = await getMeta('appVersion');
  if (last && last !== APP_VERSION && (await hasData())) {
    await backup(`Antes de usar v${APP_VERSION} (venía de v${last})`);
    toast(`Actualizada a v${APP_VERSION}`);
  }
  if (last !== APP_VERSION) await setMeta('appVersion', APP_VERSION);
  addEventListener('hashchange', () => app.refresh());
  await app.refresh();
  registerSW();
}

boot().catch((e) => {
  console.error(e);
  main.innerHTML = `<p class="empty">No se pudo abrir la base de datos: ${e.message}. Si usas Safari en modo privado, ábrela en una pestaña normal.</p>`;
});
