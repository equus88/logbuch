// Módulo Carrera: acciones del plan profesional y clasificación de ofertas reales.
import { put, del } from '../db.js';
import { esc, uid, nowISO, today, fmtDate, mins, chips, field, group, sheet, toast, weekStart, bar, pct } from '../util.js';
import { loadAll, weekSummary } from '../stats.js';
import { getSettings } from '../settings.js';

export const TIPOS = [
  ['estudio', 'Estudio técnico'],
  ['portafolio', 'Proyecto de portafolio'],
  ['cv', 'CV / LinkedIn'],
  ['ofertas', 'Lectura de ofertas'],
  ['aplicacion', 'Postulación'],
  ['networking', 'Networking'],
  ['entrevista', 'Entrevista'],
  ['otro', 'Otro'],
];
const CLASES = [['gusto', 'Lo haría con gusto'], ['sin_mas', 'Lo haría sin más'], ['no', 'No lo haría']];
const FUENTES = [['StepStone', 'StepStone'], ['LinkedIn', 'LinkedIn'], ['Xing', 'Xing'], ['Otra', 'Otra']];
const tipoName = (v) => (TIPOS.find((t) => t[0] === v) || [v, v])[1];
const claseName = (v) => (CLASES.find((t) => t[0] === v) || [v, v])[1];
let tab = 'acciones';

export async function quick(rec = null, defaults = {}) {
  const editing = !!rec;
  const r = rec || { fecha: today(), tipo: defaults.tipo || 'estudio', minutos: defaults.minutos || 60 };
  const fd = await sheet({
    title: editing ? 'Editar acción' : 'Registrar acción profesional',
    danger: editing ? 'Eliminar' : null,
    body: `
      ${field('Fecha', `<input type="date" name="fecha" value="${r.fecha}" required>`)}
      ${group('Tipo', chips('tipo', TIPOS, r.tipo, { required: true }))}
      ${group('Duración', chips('minutosChip', [[20, '20 min · mínima'], [30, '30'], [60, '60'], [90, '90']], r.minutos) + `<input type="number" name="minutos" min="0" max="600" value="${r.minutos}" class="mt" aria-label="Minutos">`)}
      ${field('Qué hiciste', `<textarea name="desc" rows="2" required placeholder="Ej.: curso de SQL, módulo 3 (joins)">${esc(r.desc || '')}</textarea>`)}
      ${field('Resultado o siguiente paso', `<textarea name="resultado" rows="2">${esc(r.resultado || '')}</textarea>`)}`,
    onOpen: (dlg) => {
      const m = dlg.querySelector('[name=minutos]');
      dlg.querySelectorAll('[name=minutosChip]').forEach((c) => c.addEventListener('change', () => { m.value = c.value; }));
    },
  });
  if (!fd) return false;
  if (fd === 'delete') { await del('carrera', r.id); toast('Acción eliminada'); return true; }
  await put('carrera', {
    ...r, id: r.id || uid(), fecha: fd.get('fecha'), tipo: fd.get('tipo'), minutos: +fd.get('minutos') || 0,
    desc: fd.get('desc').trim(), resultado: fd.get('resultado').trim(), creado: r.creado || nowISO(), editado: editing ? nowISO() : undefined,
  });
  toast(editing ? 'Acción actualizada' : 'Acción registrada');
  return true;
}

async function oferta(rec = null) {
  const r = rec || { fecha: today(), fuente: 'LinkedIn', clasificacion: '' };
  const fd = await sheet({
    title: rec ? 'Editar oferta' : 'Clasificar oferta',
    danger: rec ? 'Eliminar' : null,
    body: `
      ${field('Cargo', `<input name="titulo" required value="${esc(r.titulo || '')}" placeholder="Ej.: Junior Data Analyst">`)}
      <div class="grid2">${field('Empresa', `<input name="empresa" value="${esc(r.empresa || '')}">`)}${field('Ciudad o país', `<input name="lugar" value="${esc(r.lugar || '')}">`)}</div>
      ${group('Fuente', chips('fuente', FUENTES, r.fuente))}
      ${group('Clasificación', chips('clasificacion', CLASES, r.clasificacion, { required: true }))}
      ${field('Por qué', `<textarea name="motivo" rows="2" placeholder="Qué te atrae o te aleja">${esc(r.motivo || '')}</textarea>`)}
      ${field('Requisitos que te faltan', `<input name="brechas" value="${esc(r.brechas || '')}" placeholder="Ej.: dbt, alemán B2">`)}
      ${field('Enlace', `<input name="url" type="url" inputmode="url" value="${esc(r.url || '')}">`)}
      ${field('Fecha', `<input type="date" name="fecha" value="${r.fecha}" required>`)}`,
  });
  if (!fd) return false;
  if (fd === 'delete') { await del('ofertas', r.id); return true; }
  const v = (k) => (fd.get(k) || '').trim();
  await put('ofertas', { ...r, id: r.id || uid(), fecha: v('fecha'), titulo: v('titulo'), empresa: v('empresa'), lugar: v('lugar'), fuente: v('fuente'), clasificacion: v('clasificacion'), motivo: v('motivo'), brechas: v('brechas'), url: v('url'), creado: r.creado || nowISO() });
  toast('Oferta guardada');
  return true;
}

export async function render(root, app) {
  const [d, S] = [await loadAll(), await getSettings()];
  const A = S.areas.carrera;
  const w = weekSummary(d, weekStart()).carrera;
  const meta = S.carrera.metaOfertas;
  const cuenta = Object.fromEntries(CLASES.map(([k]) => [k, d.ofertas.filter((o) => o.clasificacion === k).length]));
  const brechas = {};
  d.ofertas.forEach((o) => (o.brechas || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).forEach((b) => { brechas[b] = (brechas[b] || 0) + 1; }));
  const topBrechas = Object.entries(brechas).sort((a, b) => b[1] - a[1]).slice(0, 8);

  root.innerHTML = `
    <section class="hero" style="--c:var(--c-pro)">
      <p class="eyebrow">${esc(S.carrera.ruta)}</p>
      <p class="hero-n"><b>${mins(w.minutos)}</b> de ${mins(A.semanaMin)} esta semana · ${w.acciones} acciones</p>
      ${bar(pct(w.minutos, A.semanaMin))}
      <div class="row mt"><button class="btn pri" data-act="add">Registrar acción</button><button class="btn" data-act="oferta">Clasificar oferta</button></div>
    </section>

    <div class="seg" role="tablist">
      <button role="tab" aria-selected="${tab === 'acciones'}" data-tab="acciones">Acciones</button>
      <button role="tab" aria-selected="${tab === 'ofertas'}" data-tab="ofertas">Ofertas (${d.ofertas.length}/${meta})</button>
    </div>

    ${tab === 'acciones' ? `
    <section class="sec">
      ${d.carrera.length ? `<ul class="list">${d.carrera.slice(0, 50).map((r) => `
        <li><button class="item" data-edit="${r.id}">
          <span class="item-t">${esc(r.desc)}</span>
          <span class="item-s">${fmtDate(r.fecha)} · ${tipoName(r.tipo)}${r.minutos ? ' · ' + mins(r.minutos) : ''}</span>
        </button></li>`).join('')}</ul>` : `<p class="empty">Sin acciones todavía. Una acción pequeña también cuenta: leer dos ofertas, ajustar una línea del CV.</p>`}
    </section>` : `
    <section class="sec">
      <p class="lede">Lee ofertas reales y clasifícalas. Con ${meta} ofertas tendrás datos para cerrar el perfil objetivo.</p>
      ${bar(pct(d.ofertas.length, meta), 'big')}
      <div class="kpis mt">${CLASES.map(([k, n]) => `<div class="kpi"><span>${n}</span><b>${cuenta[k]}</b></div>`).join('')}</div>
      ${topBrechas.length ? `<h3>Requisitos que más se repiten y te faltan</h3><ul class="tags">${topBrechas.map(([b, n]) => `<li>${esc(b)} <b>${n}</b></li>`).join('')}</ul>` : ''}
      ${d.ofertas.length ? `<ul class="list mt">${d.ofertas.map((o) => `
        <li><button class="item" data-oferta="${o.id}">
          <span class="item-t">${esc(o.titulo)}${o.empresa ? ` <span class="muted">· ${esc(o.empresa)}</span>` : ''}</span>
          <span class="item-s"><span class="pill ${o.clasificacion}">${claseName(o.clasificacion)}</span> ${esc(o.fuente || '')} · ${fmtDate(o.fecha)}</span>
        </button></li>`).join('')}</ul>` : `<p class="empty">Aún no has clasificado ofertas.</p>`}
    </section>`}`;

  root.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.tab) { tab = b.dataset.tab; app.refresh(); return; }
    let changed = false;
    if (b.dataset.act === 'add') changed = await quick();
    else if (b.dataset.act === 'oferta') { changed = await oferta(); if (changed) tab = 'ofertas'; }
    else if (b.dataset.edit) changed = await quick(d.carrera.find((x) => x.id === b.dataset.edit));
    else if (b.dataset.oferta) changed = await oferta(d.ofertas.find((x) => x.id === b.dataset.oferta));
    if (changed) app.refresh();
  };
}
