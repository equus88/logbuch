// Módulo Cuerpo: plan del día, sesiones de entrenamiento, progresión y medidas.
import { all, put, del } from '../db.js';
import { esc, uid, nowISO, today, fmtDate, mins, chips, field, group, sheet, toast, parseNum, num, weekStart, weekDays, dayShort, bar, pct, parseYmd } from '../util.js';
import { loadAll, weekSummary, exerciseProgress } from '../stats.js';
import { getSettings } from '../settings.js';
import { activePlans, dayOf, targetText, seriesString, compare, ESTADO_TXT, effectiveAreas } from '../plans.js';

const STORE = 'cuerpo';
export const TIPOS = [
  ['gluteo', 'Glúteo y piernas'],
  ['empuje', 'Empuje'],
  ['tiron', 'Tirón'],
  ['core', 'Core'],
  ['completo', 'Cuerpo completo'],
  ['movilidad', 'Movilidad'],
  ['cardio', 'Cardio y core'],
];
const tipoName = (v) => (TIPOS.find((t) => t[0] === v) || [v, v || 'Sesión'])[1];
const loadText = (e) => (e.kg != null ? `+${num(e.kg, 2)} kg` : e.banda ? `banda ${e.banda}` : '');

function exRow(e = {}) {
  const obj = e.obj ? targetText(e.obj) : '';
  const load = e.kg ?? e.banda ?? '';
  return `<div class="ex-row">
    ${obj ? `<p class="ex-obj">Objetivo: ${esc(obj)}</p>` : ''}
    <input type="hidden" name="ex_obj" value="${esc(e.obj ? JSON.stringify(e.obj) : '')}">
    <input name="ex_n" placeholder="Ejercicio" value="${esc(e.n || '')}" aria-label="Ejercicio" list="ex-names">
    <input name="ex_kg" placeholder="kg o banda" value="${esc(String(load).replace('.', ','))}" aria-label="Carga en kg o color de banda">
    <input name="ex_series" placeholder="Reps: 12/12/12" value="${esc(e.series || '')}" aria-label="Repeticiones por serie">
    <input name="ex_rpe" inputmode="decimal" placeholder="RPE" value="${e.rpe ?? ''}" aria-label="RPE">
    <button type="button" class="btn-icon" data-ex-del aria-label="Quitar ejercicio">×</button>
  </div>`;
}

// Ejercicios del plan listos para el formulario: objetivo + carga sugerida
function fromPlan(day) {
  return (day.ejercicios || []).map((o) => ({
    n: o.n,
    kg: typeof o.kg === 'number' ? o.kg : null,
    banda: o.banda || null,
    series: seriesString(o),
    rpe: null,
    obj: o,
  }));
}

export async function quick(rec = null, defaults = {}) {
  const editing = !!rec;
  const pd = defaults.planDay;
  const r = rec || {
    fecha: defaults.fecha || today(),
    tipo: pd?.tipo || defaults.tipo || 'gluteo',
    minutos: defaults.minutos || pd?.minutos || 60,
    ejercicios: pd ? fromPlan(pd) : [],
    plan: defaults.planRef || null,
  };
  const rows = await all(STORE);
  const names = [...new Set(rows.flatMap((x) => (x.ejercicios || []).map((e) => e.n)).filter(Boolean))];
  const body = `
    ${r.plan ? `<p class="plan-tag">Plan de entrenamiento v${r.plan.version}${pd ? ` · ${esc(pd.titulo || '')}` : ''}. Ajusta la carga, las repeticiones y el RPE a lo que hiciste.</p>` : ''}
    ${field('Fecha', `<input type="date" name="fecha" value="${r.fecha}" required>`)}
    ${group('Tipo de sesión', chips('tipo', TIPOS, r.tipo, { required: true }))}
    ${group('Duración', chips('minutosChip', [[20, '20 min · mínima'], [30, '30'], [45, '45'], [60, '60']], r.minutos) + `<input type="number" name="minutos" min="1" max="300" value="${r.minutos}" class="mt" aria-label="Minutos">`)}
    <div class="f">
      <div class="f-row"><span class="f-l">Ejercicios</span>${r.plan ? '' : '<button type="button" class="btn-text" data-copy-last>Copiar la última de este tipo</button>'}</div>
      <div id="ex-list">${(r.ejercicios.length ? r.ejercicios : [{}]).map(exRow).join('')}</div>
      <button type="button" class="btn-text" data-ex-add>+ Agregar ejercicio</button>
      <datalist id="ex-names">${names.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
    </div>
    ${field('Molestias o dolor', `<textarea name="molestias" rows="2" placeholder="Ej.: tríceps izquierdo cargado">${esc(r.molestias || '')}</textarea>`, 'Si algo duele, anótalo: sirve para ajustar la progresión.')}
    ${field('Nota', `<textarea name="nota" rows="2">${esc(r.nota || '')}</textarea>`)}`;

  const fd = await sheet({
    title: editing ? 'Editar sesión' : pd ? 'Registrar sesión del plan' : 'Registrar entrenamiento',
    body,
    danger: editing ? 'Eliminar' : null,
    onOpen: (dlg) => {
      const list = dlg.querySelector('#ex-list');
      const minInput = dlg.querySelector('[name=minutos]');
      dlg.querySelectorAll('[name=minutosChip]').forEach((c) => c.addEventListener('change', () => { minInput.value = c.value; }));
      dlg.querySelector('[data-ex-add]').onclick = () => list.insertAdjacentHTML('beforeend', exRow());
      list.addEventListener('click', (e) => { if (e.target.matches('[data-ex-del]')) e.target.closest('.ex-row').remove(); });
      const copy = dlg.querySelector('[data-copy-last]');
      if (copy) copy.onclick = () => {
        const tipo = dlg.querySelector('[name=tipo]:checked')?.value;
        const last = rows.find((x) => x.kind !== 'medida' && x.tipo === tipo && x.id !== r.id);
        if (!last) { toast('Aún no hay sesiones de ese tipo'); return; }
        list.innerHTML = (last.ejercicios || []).map(({ obj, ...e }) => exRow(e)).join('') || exRow();
        toast(`Copiada la sesión del ${fmtDate(last.fecha)}`);
      };
    },
  });
  if (!fd) return false;
  if (fd === 'delete') { await del(STORE, r.id); toast('Sesión eliminada'); return true; }

  const n = fd.getAll('ex_n'), kg = fd.getAll('ex_kg'), se = fd.getAll('ex_series'), rpe = fd.getAll('ex_rpe'), ob = fd.getAll('ex_obj');
  const ejercicios = n.map((x, i) => {
    const raw = (kg[i] || '').trim();
    const k = parseNum(raw);
    const e = { n: x.trim(), kg: k, series: se[i].trim(), rpe: parseNum(rpe[i]) };
    if (k == null && raw) e.banda = raw;
    if (ob[i]) { try { e.obj = JSON.parse(ob[i]); } catch { /* sin objetivo */ } }
    return e;
  }).filter((e) => e.n);
  await put(STORE, {
    ...r,
    id: r.id || uid(),
    kind: 'sesion',
    fecha: fd.get('fecha'),
    tipo: fd.get('tipo'),
    minutos: +fd.get('minutos') || 0,
    ejercicios,
    molestias: fd.get('molestias').trim(),
    nota: fd.get('nota').trim(),
    creado: r.creado || nowISO(),
    editado: editing ? nowISO() : undefined,
  });
  toast(editing ? 'Sesión actualizada' : 'Entrenamiento registrado');
  return true;
}

async function medida(rec = null) {
  const r = rec || { fecha: today() };
  const fd = await sheet({
    title: rec ? 'Editar medida' : 'Registrar medidas',
    danger: rec ? 'Eliminar' : null,
    body: `${field('Fecha', `<input type="date" name="fecha" value="${r.fecha}" required>`)}
      <div class="grid2">${field('Peso (kg)', `<input name="peso" inputmode="decimal" value="${r.peso ?? ''}">`)}${field('Cintura (cm)', `<input name="cintura" inputmode="decimal" value="${r.cintura ?? ''}">`)}</div>
      ${field('Nota', `<input name="nota" value="${esc(r.nota || '')}">`)}`,
  });
  if (!fd) return false;
  if (fd === 'delete') { await del(STORE, r.id); return true; }
  await put(STORE, { ...r, id: r.id || uid(), kind: 'medida', fecha: fd.get('fecha'), peso: parseNum(fd.get('peso')), cintura: parseNum(fd.get('cintura')), nota: fd.get('nota').trim(), creado: r.creado || nowISO() });
  toast('Medidas guardadas');
  return true;
}

// ---------- Vista del plan ----------
const steps = (title, list) => (list?.length ? `<h4>${title}</h4><ol class="steps">${list.map((s) => `<li><b>${esc(s.n)}</b>${s.dosis ? ` <span class="muted">· ${esc(s.dosis)}</span>` : ''}</li>`).join('')}</ol>` : '');

function planDayHTML(day, lastBy, done) {
  if (!day) return `<p class="empty">Descanso. Si te provoca, 20 min de movilidad o caminata: no cuenta como fallo.</p>`;
  const doneBy = new Map((done?.ejercicios || []).map((e) => [e.n.trim().toLowerCase(), e]));
  return `
    ${steps('Movilidad y calentamiento', day.calentamiento)}
    <h4>Bloque principal</h4>
    <ul class="plan-ex">${day.ejercicios.map((o) => {
      const key = o.n.trim().toLowerCase();
      const last = lastBy.get(key);
      const real = doneBy.get(key);
      const cmp = real ? compare(real, real.obj || o) : null;
      return `<li>
        <div class="pe-h"><b>${esc(o.n)}</b>${cmp ? `<span class="badge ${cmp.estado}">${ESTADO_TXT[cmp.estado]}</span>` : ''}</div>
        <p class="pe-t">${esc(targetText(o))}${o.descanso ? ` · descanso ${esc(String(o.descanso))}` : ''}</p>
        ${real ? `<p class="pe-l">Hoy: ${esc([loadText(real), real.series, real.rpe != null ? `RPE ${num(real.rpe)}` : ''].filter(Boolean).join(' · '))}</p>`
          : last ? `<p class="pe-l">Última vez (${fmtDate(last.ultima.fecha)}): ${esc([loadText(last.ultima), last.ultima.series, last.ultima.rpe != null ? `RPE ${num(last.ultima.rpe)}` : ''].filter(Boolean).join(' · '))}</p>` : ''}
        ${o.nota ? `<p class="pe-n">${esc(o.nota)}</p>` : ''}
      </li>`;
    }).join('')}</ul>
    ${steps('Vuelta a la calma', day.cierre)}
    ${day.nota ? `<p class="plan-note">${esc(day.nota)}</p>` : ''}
    ${day.minimo ? `<p class="plan-min"><b>Versión mínima:</b> ${esc(day.minimo)}</p>` : ''}`;
}

let viewDate = null;

export async function render(root, app) {
  const [d, S, plans] = [await loadAll(), await getSettings(), await activePlans()];
  const A = effectiveAreas(S, plans).ejercicio;
  const plan = plans.cuerpo;
  const t = today();
  const ws = weekStart();
  if (!viewDate || viewDate < ws || viewDate > weekDays(ws)[6]) viewDate = t;
  const day = dayOf(plan, viewDate);
  const w = weekSummary(d, ws);
  const ses = d.cuerpo.filter((r) => r.kind !== 'medida');
  const med = d.cuerpo.filter((r) => r.kind === 'medida');
  const prog = exerciseProgress(d);
  const lastBy = new Map(prog.map((p) => [p.nombre.toLowerCase(), p]));
  const doneOn = ses.find((s) => s.fecha === viewDate && s.plan);
  const isToday = viewDate === t;

  root.innerHTML = `
    <section class="hero" style="--c:var(--c-ejercicio)">
      <p class="eyebrow">Esta semana</p>
      <p class="hero-n"><b>${w.ejercicio.sesiones}</b> de ${A.semanaSesiones} sesiones · ${mins(w.ejercicio.minutos)}</p>
      ${bar(pct(w.ejercicio.sesiones, A.semanaSesiones))}
      <div class="row mt"><button class="btn" data-act="add">Sesión libre</button><button class="btn" data-act="medida">Medidas</button></div>
    </section>

    <section class="sec plan" style="--c:var(--c-ejercicio)">
      <div class="plan-h"><h2>${isToday ? 'Hoy toca' : `El ${fmtDate(viewDate)}`}</h2>${plan ? `<span class="muted small">Plan v${plan.version}</span>` : ''}</div>
      ${plan ? `
        <div class="daystrip" role="tablist">${weekDays(ws).map((f) => { const pdx = dayOf(plan, f); const did = ses.some((s) => s.fecha === f); return `<button role="tab" aria-selected="${f === viewDate}" data-day="${f}" class="${f === t ? 'is-today' : ''} ${did ? 'did' : ''} ${pdx ? '' : 'rest'}"><span>${dayShort(f)}</span><small>${parseYmd(f).getDate()}</small></button>`; }).join('')}</div>
        ${day ? `<p class="plan-title"><b>${esc(day.titulo || tipoName(day.tipo))}</b>${day.minutos ? ` · ${mins(day.minutos)}` : ''}</p>` : ''}
        ${planDayHTML(day, lastBy, doneOn)}
        ${day ? `<div class="row mt">${doneOn ? `<button class="btn" data-edit="${doneOn.id}">Editar lo registrado</button>` : `<button class="btn pri" data-act="plan">Registrar esta sesión</button>`}</div>` : ''}
        <details class="plan-more"><summary>Sobre este plan</summary>
          <p><b>${esc(plan.titulo || '')}</b> · vigente desde el ${fmtDate(plan.desde)}</p>
          ${plan.resumen ? `<p>${esc(plan.resumen)}</p>` : ''}
          ${plan.progresion ? `<p><b>Progresión:</b> ${esc(plan.progresion)}</p>` : ''}
          ${plan.cambios?.length ? `<p><b>Cambios en esta versión:</b></p><ul>${plan.cambios.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
        </details>`
      : `<p class="empty">Aún no hay plan de entrenamiento. Cuando Claude te envíe el archivo del plan, impórtalo en <a href="#/datos">Datos</a>.</p>`}
    </section>

    <section class="sec">
      <h2>Progresión por ejercicio</h2>
      ${prog.length ? `<div class="tbl"><table><thead><tr><th>Ejercicio</th><th class="n">Última</th><th class="n">Mejor</th></tr></thead><tbody>
        ${prog.slice(0, 25).map((p) => `<tr><td>${esc(p.nombre)}<small>${fmtDate(p.ultima.fecha)} · ${p.veces} reg.</small></td>
          <td class="n">${loadText(p.ultima) || '—'}<small>${esc(p.ultima.series || '')}${p.ultima.rpe != null ? ` · RPE ${num(p.ultima.rpe)}` : ''}</small></td>
          <td class="n">${p.mejorKg != null ? `+${num(p.mejorKg, 2)} kg` : '—'}</td></tr>`).join('')}
      </tbody></table></div>` : `<p class="empty">Cuando registres ejercicios con su carga, aquí verás la última carga y la mejor de cada uno.</p>`}
    </section>

    <section class="sec">
      <h2>Sesiones</h2>
      ${ses.length ? `<ul class="list">${ses.slice(0, 40).map((r) => `
        <li><button class="item" data-edit="${r.id}">
          <span class="item-t">${tipoName(r.tipo)} <span class="muted">· ${mins(r.minutos)}</span></span>
          <span class="item-s">${fmtDate(r.fecha)} · ${(r.ejercicios || []).length} ${(r.ejercicios || []).length === 1 ? 'ejercicio' : 'ejercicios'}${r.plan ? ` · plan v${r.plan.version}` : ''}${r.molestias ? ' · <span class="warn">molestias</span>' : ''}</span>
        </button></li>`).join('')}</ul>` : `<p class="empty">Sin sesiones todavía. La versión mínima de 20 minutos también cuenta.</p>`}
    </section>

    <section class="sec">
      <h2>Medidas</h2>
      ${med.length ? `<ul class="list">${med.slice(0, 12).map((r) => `<li><button class="item" data-medida="${r.id}"><span class="item-t">${r.peso != null ? `${num(r.peso)} kg` : '—'}${r.cintura != null ? ` · cintura ${num(r.cintura)} cm` : ''}</span><span class="item-s">${fmtDate(r.fecha)}${r.nota ? ' · ' + esc(r.nota) : ''}</span></button></li>`).join('')}</ul>` : `<p class="empty">Sin medidas registradas.</p>`}
    </section>`;

  root.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.day) { viewDate = b.dataset.day; app.refresh(); return; }
    let changed = false;
    if (b.dataset.act === 'add') changed = await quick();
    else if (b.dataset.act === 'plan') changed = await openPlanSession(plan, viewDate);
    else if (b.dataset.act === 'medida') changed = await medida();
    else if (b.dataset.edit) changed = await quick(ses.find((x) => x.id === b.dataset.edit));
    else if (b.dataset.medida) changed = await medida(med.find((x) => x.id === b.dataset.medida));
    if (changed) app.refresh();
  };
}

// Abre el registro con la sesión del plan para una fecha (usado también desde Hoy)
export async function openPlanSession(plan, fecha = today(), minutos = null) {
  const day = dayOf(plan, fecha);
  if (!day) return quick(null, minutos ? { minutos } : {});
  const ok = await quick(null, { planDay: day, planRef: { area: 'cuerpo', version: plan.version, dia: parseYmd(fecha).getDay() }, minutos, fecha });
  return ok;
}
