// Módulo Idiomas: sesiones de inglés y alemán, resultados de ejercicios y registro de errores.
import { put, del } from '../db.js';
import { esc, uid, nowISO, today, fmtDate, mins, chips, field, group, sheet, toast, weekStart, weekDays, dayShort, parseYmd, bar, pct } from '../util.js';
import { loadAll, weekSummary } from '../stats.js';
import { getSettings } from '../settings.js';
import { activePlans, dayOf, effectiveAreas } from '../plans.js';

const STORE = 'idiomas';
export const LANGS = { en: 'Inglés', de: 'Alemán' };
export const TIPOS = [
  ['leccion', 'Lección nueva'],
  ['gramatica', 'Gramática'],
  ['vocabulario', 'Vocabulario / Anki'],
  ['escucha', 'Escucha'],
  ['produccion', 'Producción escrita'],
  ['oral', 'Práctica oral'],
  ['repaso', 'Repaso de errores'],
];
const tipoName = (v) => (TIPOS.find((t) => t[0] === v) || [v, v])[1];
let current = 'en';
let viewDate = null;

export async function quick(rec = null, defaults = {}) {
  const editing = !!rec;
  const pd = defaults.planDay;
  const r = rec || {
    fecha: defaults.fecha || today(),
    idioma: defaults.idioma || current,
    minutos: defaults.minutos || pd?.minutos || 45,
    tipo: pd ? 'leccion' : 'leccion',
    tema: pd?.titulo || '',
    total: pd?.evaluacion?.total ?? null,
    plan: defaults.planRef || null,
    bloquesPlan: pd ? pd.bloques.map((b) => b.n) : null,
    bloques: pd ? pd.bloques.map((b) => b.n) : null,
  };
  const evalName = pd?.evaluacion?.n || r.evalNombre || '';
  const fd = await sheet({
    title: editing ? 'Editar sesión' : pd ? 'Registrar sesión del plan' : 'Registrar estudio',
    danger: editing ? 'Eliminar' : null,
    body: `
      ${r.plan ? `<p class="plan-tag">Plan de ${LANGS[r.idioma].toLowerCase()} v${r.plan.version}. Marca los bloques que hiciste y anota el resultado.</p>` : ''}
      ${r.bloquesPlan?.length ? group('Bloques hechos', `<div class="checks">${r.bloquesPlan.map((b) => `<label class="check"><input type="checkbox" name="bloques" value="${esc(b)}" ${(r.bloques || []).includes(b) ? 'checked' : ''}> ${esc(b)}</label>`).join('')}</div>`) : ''}
      ${group('Idioma', chips('idioma', Object.entries(LANGS), r.idioma, { required: true }))}
      ${field('Fecha', `<input type="date" name="fecha" value="${r.fecha}" required>`)}
      ${group('Duración', chips('minutosChip', [[15, '15 min · mínima'], [30, '30'], [45, '45'], [60, '60']], r.minutos) + `<input type="number" name="minutos" min="1" max="300" value="${r.minutos}" class="mt" aria-label="Minutos">`)}
      ${group('Qué hiciste', chips('tipo', TIPOS, r.tipo, { required: true }))}
      ${field('Tema', `<input name="tema" value="${esc(r.tema || '')}" placeholder="Ej.: present perfect vs past simple">`)}
      <div class="grid2">
        ${field(evalName ? `Aciertos · ${evalName}` : 'Aciertos', `<input name="aciertos" type="number" min="0" value="${r.aciertos ?? ''}">`)}
        ${field('De un total de', `<input name="total" type="number" min="0" value="${r.total ?? ''}">`)}
      </div>
      ${field('Errores detectados', `<textarea name="errores" rows="3" placeholder="Uno por línea: lo que dijiste → lo correcto">${esc((r.errores || []).join('\n'))}</textarea>`, 'Alimentan el registro de errores y el repaso del domingo.')}
      ${field('Nota', `<textarea name="nota" rows="2">${esc(r.nota || '')}</textarea>`)}`,
    onOpen: (dlg) => {
      const m = dlg.querySelector('[name=minutos]');
      dlg.querySelectorAll('[name=minutosChip]').forEach((c) => c.addEventListener('change', () => { m.value = c.value; }));
    },
  });
  if (!fd) return false;
  if (fd === 'delete') { await del(STORE, r.id); toast('Sesión eliminada'); return true; }
  const n = (k) => (fd.get(k) === '' ? null : +fd.get(k));
  await put(STORE, {
    ...r,
    id: r.id || uid(),
    fecha: fd.get('fecha'),
    idioma: fd.get('idioma'),
    minutos: +fd.get('minutos') || 0,
    tipo: fd.get('tipo'),
    tema: fd.get('tema').trim(),
    aciertos: n('aciertos'),
    total: n('total'),
    errores: fd.get('errores').split('\n').map((s) => s.trim()).filter(Boolean),
    nota: fd.get('nota').trim(),
    bloques: r.bloquesPlan ? fd.getAll('bloques') : r.bloques,
    evalNombre: evalName || undefined,
    creado: r.creado || nowISO(),
    editado: editing ? nowISO() : undefined,
  });
  current = fd.get('idioma');
  toast(editing ? 'Sesión actualizada' : 'Estudio registrado');
  return true;
}

export async function render(root, app) {
  const [d, S, plans] = [await loadAll(), await getSettings(), await activePlans()];
  const key = current === 'en' ? 'ingles' : 'aleman';
  const A = effectiveAreas(S, plans)[key];
  const plan = plans[current];
  const t = today(), ws = weekStart();
  if (!viewDate || viewDate < ws || viewDate > weekDays(ws)[6]) viewDate = t;
  const day = dayOf(plan, viewDate);
  const w = weekSummary(d, weekStart())[key];
  const rows = d.idiomas.filter((r) => r.idioma === current);
  const scored = rows.filter((r) => r.total > 0).slice(0, 10);
  const avg = scored.length ? scored.reduce((a, r) => a + r.aciertos / r.total, 0) / scored.length : null;
  const errores = rows.flatMap((r) => (r.errores || []).map((e) => ({ e, fecha: r.fecha, tema: r.tema })));
  const lvl = S.niveles[current];
  const color = current === 'en' ? 'var(--c-ingles)' : 'var(--c-aleman)';
  const doneOn = rows.find((r) => r.fecha === viewDate && r.plan);
  const isToday = viewDate === t;

  root.innerHTML = `
    <div class="seg" role="tablist">${Object.entries(LANGS).map(([k, n]) => `<button role="tab" aria-selected="${k === current}" data-lang="${k}">${n}</button>`).join('')}</div>

    <section class="hero" style="--c:${color}">
      <p class="eyebrow">Nivel ${esc(lvl.actual)} → meta ${esc(lvl.meta)}</p>
      <p class="hero-n"><b>${mins(w.minutos)}</b> de ${mins(A.semanaMin)} esta semana · ${w.sesiones} sesiones</p>
      ${bar(pct(w.minutos, A.semanaMin))}
      <div class="row mt"><button class="btn" data-act="add">Sesión libre</button></div>
    </section>

    <section class="sec plan" style="--c:${color}">
      <div class="plan-h"><h2>${isToday ? 'Hoy toca' : `El ${fmtDate(viewDate)}`}</h2>${plan ? `<span class="muted small">Plan v${plan.version}</span>` : ''}</div>
      ${plan ? `
        <div class="daystrip" role="tablist">${weekDays(ws).map((f) => { const pdx = dayOf(plan, f); const did = rows.some((r) => r.fecha === f); return `<button role="tab" aria-selected="${f === viewDate}" data-day="${f}" class="${f === t ? 'is-today' : ''} ${did ? 'did' : ''} ${pdx ? '' : 'rest'}"><span>${dayShort(f)}</span><small>${parseYmd(f).getDate()}</small></button>`; }).join('')}</div>
        ${day ? `
          <p class="plan-title"><b>${esc(day.titulo)}</b>${day.minutos ? ` · ${mins(day.minutos)}` : ''}${doneOn ? ' · <span class="badge cumplido">Registrada</span>' : ''}</p>
          <ol class="blocks">${day.bloques.map((b) => `<li class="${doneOn && (doneOn.bloques || []).includes(b.n) ? 'done' : ''}"><div class="bl-h"><b>${esc(b.n)}</b>${b.min ? `<span>${b.min} min</span>` : ''}</div><p>${esc(b.que)}</p></li>`).join('')}</ol>
          ${day.evaluacion ? `<p class="plan-note"><b>Registra:</b> ${esc(day.evaluacion.n)} (sobre ${day.evaluacion.total}).${doneOn?.total ? ` Resultado: ${doneOn.aciertos ?? '—'}/${doneOn.total}.` : ''}</p>` : ''}
          ${day.nota ? `<p class="plan-note">${esc(day.nota)}</p>` : ''}
          ${day.minimo ? `<p class="plan-min"><b>Versión mínima:</b> ${esc(day.minimo)}</p>` : ''}
          <div class="row mt">${doneOn ? `<button class="btn" data-edit="${doneOn.id}">Editar lo registrado</button>` : `<button class="btn pri" data-act="plan">Registrar esta sesión</button>`}</div>`
        : `<p class="empty">Sin sesión este día.</p>`}
        <details class="plan-more"><summary>Sobre este plan</summary>
          <p><b>${esc(plan.titulo || '')}</b> · vigente desde el ${fmtDate(plan.desde)}</p>
          ${plan.resumen ? `<p>${esc(plan.resumen)}</p>` : ''}
          ${plan.progresion ? `<p><b>Progresión:</b> ${esc(plan.progresion)}</p>` : ''}
          ${plan.cambios?.length ? `<p><b>Cambios en esta versión:</b></p><ul>${plan.cambios.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
        </details>`
      : `<p class="empty">Aún no hay plan de ${LANGS[current].toLowerCase()}. Cuando Claude te envíe el archivo del plan, impórtalo en <a href="#/datos">Datos</a>.</p>`}
    </section>

    <section class="sec">
      <h2>Resultados</h2>
      <div class="kpis">
        <div class="kpi"><span>Promedio últimos ejercicios</span><b>${avg == null ? '—' : Math.round(avg * 100) + ' %'}</b></div>
        <div class="kpi"><span>Errores registrados</span><b>${errores.length}</b></div>
        <div class="kpi"><span>Sesiones totales</span><b>${rows.length}</b></div>
      </div>
      ${scored.length ? `<div class="spark" style="--c:${color}" aria-label="Aciertos de los últimos ejercicios">${scored.slice().reverse().map((r) => `<i style="height:${Math.max(6, Math.round((r.aciertos / r.total) * 100))}%" title="${fmtDate(r.fecha)}: ${r.aciertos}/${r.total}"></i>`).join('')}</div><p class="small muted">Aciertos de los últimos ${scored.length} ejercicios, del más antiguo al más reciente.</p>` : ''}
    </section>

    <section class="sec">
      <h2>Registro de errores</h2>
      ${errores.length ? `<ul class="errlog">${errores.slice(0, 30).map((x) => `<li>${esc(x.e)}<small>${fmtDate(x.fecha)}${x.tema ? ' · ' + esc(x.tema) : ''}</small></li>`).join('')}</ul>` : `<p class="empty">Cuando anotes errores en una sesión, se acumulan aquí para el repaso semanal.</p>`}
    </section>

    <section class="sec">
      <h2>Sesiones</h2>
      ${rows.length ? `<ul class="list">${rows.slice(0, 40).map((r) => `
        <li><button class="item" data-edit="${r.id}">
          <span class="item-t">${tipoName(r.tipo)}${r.tema ? ` <span class="muted">· ${esc(r.tema)}</span>` : ''}</span>
          <span class="item-s">${fmtDate(r.fecha)} · ${mins(r.minutos)}${r.total ? ` · ${r.aciertos}/${r.total}` : ''}${(r.errores || []).length ? ` · ${r.errores.length} errores` : ''}</span>
        </button></li>`).join('')}</ul>` : `<p class="empty">Sin sesiones de ${LANGS[current].toLowerCase()} todavía.</p>`}
    </section>`;

  root.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.lang) { current = b.dataset.lang; app.refresh(); return; }
    if (b.dataset.day) { viewDate = b.dataset.day; app.refresh(); return; }
    let changed = false;
    if (b.dataset.act === 'add') changed = await quick(null, { idioma: current });
    else if (b.dataset.act === 'plan') changed = await openPlanSession(plan, current, viewDate);
    else if (b.dataset.edit) changed = await quick(rows.find((x) => x.id === b.dataset.edit));
    if (changed) app.refresh();
  };
}

// Abre el registro con la sesión del plan (usado también desde Hoy)
export async function openPlanSession(plan, idioma, fecha = today(), minutos = null) {
  const day = dayOf(plan, fecha);
  if (!day) return quick(null, { idioma, minutos });
  return quick(null, { idioma, planDay: day, planRef: { area: idioma, version: plan.version, dia: parseYmd(fecha).getDay() }, minutos, fecha });
}
