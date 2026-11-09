// Vista Datos: exportar para Claude, copias, restauración, metas y versión.
import { restoreAll, listBackups, wipe, backup } from '../db.js';
import { APP_VERSION, SCHEMA_VERSION, BUILD_DATE } from '../version.js';
import { esc, today, toast, deliverFile, copyText, field, sheet, num, fmtDate } from '../util.js';
import { claudePackage, claudeText, fullBackup } from '../export.js';
import { getSettings, saveSettings } from '../settings.js';
import { importKassenbuch } from './finanzas.js';
import { allPlans, activePlans, plansFromFile, validatePlan, savePlan, AREAS_PLAN } from '../plans.js';

async function storageInfo() {
  const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null;
  const est = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  return { persisted, used: est?.usage, standalone };
}

async function editMetas() {
  const S = await getSettings();
  const A = S.areas;
  const fd = await sheet({
    title: 'Metas y contenedores',
    body: `
      <p class="small muted">Minutos del contenedor diario, versión mínima y meta semanal. Cuando Claude reconfigure el plan, ajusta estos valores aquí.</p>
      ${Object.entries(A).map(([k, a]) => `<div class="card-f"><b>${esc(a.nombre)}</b><div class="grid3">
        ${field('Diario (min)', `<input type="number" name="${k}_diario" value="${a.diario}" min="0">`)}
        ${field('Mínima (min)', `<input type="number" name="${k}_minimo" value="${a.minimo}" min="0">`)}
        ${k === 'ejercicio' ? field('Sesiones/semana', `<input type="number" name="${k}_sem" value="${a.semanaSesiones}" min="0" max="7">`) : field('Semana (min)', `<input type="number" name="${k}_sem" value="${a.semanaMin}" min="0">`)}
      </div></div>`).join('')}
      <h3>Niveles de idioma</h3>
      <div class="grid2">${field('Inglés actual', `<input name="en_actual" value="${esc(S.niveles.en.actual)}">`)}${field('Inglés meta', `<input name="en_meta" value="${esc(S.niveles.en.meta)}">`)}</div>
      <div class="grid2">${field('Alemán actual', `<input name="de_actual" value="${esc(S.niveles.de.actual)}">`)}${field('Alemán meta', `<input name="de_meta" value="${esc(S.niveles.de.meta)}">`)}</div>
      <h3>Carrera</h3>
      ${field('Ruta profesional', `<input name="ruta" value="${esc(S.carrera.ruta)}">`)}
      ${field('Meta de ofertas a clasificar', `<input type="number" name="metaOfertas" value="${S.carrera.metaOfertas}" min="1">`)}`,
  });
  if (!fd) return false;
  for (const k of Object.keys(A)) {
    A[k].diario = +fd.get(`${k}_diario`) || 0;
    A[k].minimo = +fd.get(`${k}_minimo`) || 0;
    if (k === 'ejercicio') A[k].semanaSesiones = +fd.get(`${k}_sem`) || 0; else A[k].semanaMin = +fd.get(`${k}_sem`) || 0;
  }
  S.niveles.en = { actual: fd.get('en_actual').trim(), meta: fd.get('en_meta').trim() };
  S.niveles.de = { actual: fd.get('de_actual').trim(), meta: fd.get('de_meta').trim() };
  S.carrera.ruta = fd.get('ruta').trim();
  S.carrera.metaOfertas = +fd.get('metaOfertas') || 30;
  await saveSettings(S);
  toast('Metas guardadas');
  return true;
}

async function restoreFile(file) {
  let obj;
  try { obj = JSON.parse(await file.text()); } catch { toast('Ese archivo no es JSON válido'); return false; }
  const planes = plansFromFile(obj);
  if (planes) {
    if (!planes.length) { toast('El archivo no trae planes'); return false; }
    const errs = planes.flatMap((p, i) => validatePlan(p).map((e) => `Plan ${i + 1}: ${e}`));
    if (errs.length) { alert('No se pudo importar el plan:\n' + errs.join('\n')); return false; }
    const existing = await allPlans();
    const dup = planes.filter((p) => existing.some((x) => x.area === p.area && x.version === p.version));
    const lista = planes.map((p) => `• ${AREAS_PLAN[p.area]} v${p.version}, desde el ${fmtDate(p.desde)}`).join('\n');
    if (!confirm(`Importar ${planes.length === 1 ? 'este plan' : 'estos planes'}?\n${lista}${dup.length ? '\n\nAlgunas versiones ya existen y se reemplazarán.' : ''}`)) return false;
    for (const p of planes) await savePlan(p);
    toast(planes.length === 1 ? 'Plan importado' : `${planes.length} planes importados`);
    return true;
  }
  if (obj?.app === 'kassenbuch') {
    if (!confirm(`Importar la copia del Kassenbuch del ${obj.fecha || 'archivo'}? Reemplaza los saldos de Finanzas y agrega sus movimientos.`)) return false;
    await backup('Antes de importar el Kassenbuch');
    const n = await importKassenbuch(obj);
    toast(`Kassenbuch importado: ${n} movimientos`);
    return true;
  }
  if (obj?.app === 'logbuch' && obj.tipo === 'copia' && obj.data) {
    if (obj.schema > SCHEMA_VERSION) { alert('Esta copia viene de una versión más nueva de la app. Actualiza Logbuch antes de restaurarla.'); return false; }
    if (!confirm(`Restaurar la copia del ${obj.fecha?.slice(0, 10)}? Reemplaza todos los datos actuales.`)) return false;
    await backup('Antes de restaurar una copia');
    await restoreAll(obj.data, obj.schema || 1);
    toast('Copia restaurada');
    return true;
  }
  toast('No reconozco el formato de ese archivo');
  return false;
}

export async function render(root, app) {
  const info = await storageInfo();
  const vig = await activePlans();
  const hist = await allPlans();
  const backups = await listBackups();
  const opts = { semanas: 4, finanzas: true };

  root.innerHTML = `
    <section class="sec">
      <h2>Exportar para Claude</h2>
      <p class="lede">Copia el resumen y pégalo en el chat del proyecto. Si quieres un análisis más fino, comparte también el archivo con el detalle completo.</p>
      <div class="f">
        <span class="f-l">Semanas incluidas</span>
        <div class="chips">${[1, 2, 4, 8].map((n) => `<label class="chip"><input type="radio" name="semanas" value="${n}" ${n === 4 ? 'checked' : ''}><span>${n}</span></label>`).join('')}</div>
      </div>
      <label class="check"><input type="checkbox" name="fin" checked> Incluir finanzas</label>
      <div class="row mt"><button class="btn pri" data-act="copy">Copiar resumen</button><button class="btn" data-act="json">Compartir archivo</button></div>
    </section>

    <section class="sec">
      <h2>Planes</h2>
      <p class="lede">Claude genera versiones nuevas de tus planes a partir de lo que registras. Impórtalas con <b>Restaurar o importar</b>.</p>
      <ul class="list">${Object.entries(AREAS_PLAN).map(([a, n]) => { const p = vig[a]; const h = hist.filter((x) => x.area === a); const futura = h.find((x) => x.desde > today()); return `<li><div class="item static"><span class="item-t">${n}: ${p ? `v${p.version}` : 'sin plan'}</span><span class="item-s">${p ? `${esc(p.titulo || '')} · desde el ${fmtDate(p.desde)}` : 'Llega como archivo de Claude'}${h.length > 1 ? ` · ${h.length} versiones guardadas` : ''}${futura ? ` · v${futura.version} empieza el ${fmtDate(futura.desde)}` : ''}</span></div></li>`; }).join('')}</ul>
    </section>

    <section class="sec">
      <h2>Copias de seguridad</h2>
      <p class="lede">Tus datos viven en este iPhone. Guarda una copia en Archivos o iCloud Drive cada semana: es lo que te protege si borras la app o cambias de teléfono.</p>
      <div class="row"><button class="btn pri" data-act="backup">Guardar copia</button><label class="btn">Restaurar o importar<input type="file" accept="application/json,.json" data-act="restore" hidden></label></div>
      <p class="small muted mt">Acepta planes de Claude, copias de Logbuch y copias JSON del Kassenbuch.</p>
      ${backups.length ? `<h3>Copias automáticas en el teléfono</h3><ul class="list">${backups.map((b) => `<li><button class="item" data-bk="${esc(b.id)}"><span class="item-t">${esc(b.reason)}</span><span class="item-s">${esc(b.id.slice(0, 16).replace('T', ' '))} · esquema ${b.schema} · toca para descargar</span></button></li>`).join('')}</ul>` : ''}
    </section>

    <section class="sec">
      <h2>Metas</h2>
      <div class="row"><button class="btn" data-act="metas">Editar metas y contenedores</button></div>
    </section>

    <section class="sec">
      <h2>Versión</h2>
      <dl class="meta">
        <dt>App</dt><dd>v${APP_VERSION} (${BUILD_DATE})</dd>
        <dt>Esquema de datos</dt><dd>${SCHEMA_VERSION}</dd>
        <dt>Instalada en inicio</dt><dd>${info.standalone ? 'Sí' : 'No: ábrela desde Safari → Compartir → Agregar a inicio'}</dd>
        <dt>Almacenamiento persistente</dt><dd>${info.persisted == null ? 'No disponible' : info.persisted ? 'Sí' : 'No concedido'}</dd>
        ${info.used != null ? `<dt>Espacio usado</dt><dd>${num(info.used / 1024, 0)} KB</dd>` : ''}
      </dl>
      <div class="row"><button class="btn" data-act="update">Buscar actualización</button></div>
    </section>

    <section class="sec danger-zone">
      <h2>Borrar datos</h2>
      <p class="small muted">Antes de borrar se guarda una copia automática, pero descarga una copia propia primero.</p>
      <button class="btn danger" data-act="wipe">Borrar todos los datos</button>
    </section>`;

  const readOpts = () => ({ semanas: +root.querySelector('[name=semanas]:checked').value, finanzas: root.querySelector('[name=fin]').checked });

  root.onchange = async (e) => {
    if (e.target.dataset.act === 'restore' && e.target.files[0]) {
      if (await restoreFile(e.target.files[0])) app.refresh();
      e.target.value = '';
    }
  };
  root.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'copy') { const ok = await copyText(await claudeText(readOpts())); toast(ok ? 'Resumen copiado. Pégalo en el chat con Claude.' : 'No se pudo copiar'); }
    else if (act === 'json') { await deliverFile(`logbuch-claude-${today()}.json`, JSON.stringify(await claudePackage(readOpts()), null, 1)); }
    else if (act === 'backup') { await deliverFile(`logbuch-copia-${today()}.json`, JSON.stringify(await fullBackup())); }
    else if (act === 'metas') { if (await editMetas()) app.refresh(); }
    else if (act === 'update') { const ok = await app.checkUpdate(); if (!ok) toast('Tienes la versión más reciente'); }
    else if (act === 'wipe') {
      if (!confirm('¿Borrar todos los datos de Logbuch?')) return;
      if (prompt('Escribe BORRAR para confirmar') !== 'BORRAR') return;
      await backup('Antes de borrar todo'); await wipe(); toast('Datos borrados'); app.refresh();
    } else if (b.dataset.bk) {
      const bk = backups.find((x) => x.id === b.dataset.bk);
      await deliverFile(`logbuch-auto-${bk.id.slice(0, 10)}.json`, JSON.stringify({ app: 'logbuch', tipo: 'copia', appVersion: APP_VERSION, schema: bk.schema, fecha: bk.id, data: bk.data }));
    }
  };
}
