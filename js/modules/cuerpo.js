// Módulo Cuerpo: plan del día, sesiones de entrenamiento, progresión y medidas.
import { all, put, del, setMeta } from '../db.js';
import { loadDraft, clearDraft, autosave, draftTime, draftKeys } from '../drafts.js';
import { esc, uid, nowISO, today, fmtDate, mins, chips, field, group, sheet, toast, parseNum, num, weekStart, weekDays, dayShort, bar, pct, parseYmd } from '../util.js';
import { loadAll, weekSummary, exerciseProgress } from '../stats.js';
import { getSettings } from '../settings.js';
import { activePlans, dayOf, targetText, seriesString, compare, ESTADO_TXT, effectiveAreas, planDayForRecord } from '../plans.js';

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
// Cargas totales (mango incluido), como en el plan
const loadText = (e) => (e.kg != null ? `${num(e.kg, 2)} kg` : e.banda ? `banda ${e.banda}` : '');

function exRow(e = {}) {
  const o = e.obj;
  const load = e.kg ?? e.banda ?? '';
  return `<div class="ex-row">
    ${o ? `<div class="ex-obj"><b>${esc(o.n)}</b><span>Objetivo: ${esc(targetText(o))}${o.descanso ? ` · descanso ${esc(String(o.descanso))}` : ''}</span>
      ${o.nota || o.video ? `<details class="ex-tec"><summary>Técnica</summary>${o.nota ? `<p>${esc(o.nota)}</p>` : ''}${o.video ? `<a href="${esc(o.video)}" target="_blank" rel="noopener">Ver video ↗</a>` : ''}</details>` : ''}</div>` : ''}
    <input type="hidden" name="ex_obj" value="${esc(o ? JSON.stringify(o) : '')}">
    <input name="ex_n" placeholder="Ejercicio" value="${esc(e.n || '')}" aria-label="Ejercicio" list="ex-names" ${o ? 'class="ex-n-plan"' : ''}>
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

const stepsList = (list) => `<ol class="steps">${list.map((x) => `<li><b>${esc(x.n)}</b>${x.dosis ? ` <span class="muted">· ${esc(x.dosis)}</span>` : ''}</li>`).join('')}</ol>`;

// Convierte el formulario en un registro (se usa al guardar y en el borrador)
function buildRecord(fd, r) {
  const n = fd.getAll('ex_n'), kg = fd.getAll('ex_kg'), se = fd.getAll('ex_series'), rpe = fd.getAll('ex_rpe'), ob = fd.getAll('ex_obj');
  const ejercicios = n.map((x, i) => {
    const raw = (kg[i] || '').trim();
    const k = parseNum(raw);
    const e = { n: x.trim(), kg: k, series: (se[i] || '').trim(), rpe: parseNum(rpe[i]) };
    if (k == null && raw) e.banda = raw;
    if (ob[i]) { try { e.obj = JSON.parse(ob[i]); } catch { /* sin objetivo */ } }
    return e;
  }).filter((e) => e.n);
  return {
    ...r,
    kind: 'sesion',
    fecha: fd.get('fecha') || r.fecha,
    tipo: fd.get('tipo') || r.tipo,
    minutos: +fd.get('minutos') || 0,
    ejercicios,
    molestias: (fd.get('molestias') || '').trim(),
    nota: (fd.get('nota') || '').trim(),
  };
}

export async function quick(rec = null, defaults = {}) {
  const editing = !!rec?.id;
  const pd = defaults.planDay || (rec?.plan ? await planDayForRecord(rec) : null);
  const base = rec || {
    fecha: defaults.fecha || today(),
    tipo: pd?.tipo || defaults.tipo || 'gluteo',
    minutos: defaults.minutos || pd?.minutos || 60,
    ejercicios: pd ? fromPlan(pd) : [],
    plan: defaults.planRef || null,
    extra: defaults.extra || undefined,
  };
  const dkey = `cuerpo:${base.id || `nuevo:${base.fecha}${base.extra ? ':extra' : ''}`}`;
  const draft = await loadDraft(dkey);
  const r = draft ? { ...base, ...draft.rec, id: base.id, creado: base.creado } : base;
  const rows = await all(STORE);
  const names = [...new Set(rows.flatMap((x) => (x.ejercicios || []).map((e) => e.n)).filter(Boolean))];
  const fresh = !editing && !draft;
  const body = `
    ${draft ? `<div class="draft-note"><span>Retomas lo que llevabas registrado (guardado a las ${draftTime(draft.guardado)}).</span><button type="button" class="btn-text" data-resolve="descartar">Descartar cambios</button></div>` : ''}
    ${r.plan ? `<p class="plan-tag">${r.extra ? 'Sesión adicional · ' : ''}Plan de entrenamiento v${r.plan.version}${pd ? ` · ${esc(pd.titulo || '')}` : ''}. Lo que escribes se guarda solo: puedes cerrar y volver.</p>` : r.extra ? '<p class="plan-tag">Sesión adicional al plan.</p>' : ''}
    ${pd?.calentamiento?.length ? `<details class="guide" ${fresh ? 'open' : ''}><summary>Calentamiento</summary>${stepsList(pd.calentamiento)}</details>` : ''}
    ${field('Fecha', `<input type="date" name="fecha" value="${r.fecha}" required>`)}
    ${group('Tipo de sesión', chips('tipo', TIPOS, r.tipo, { required: true }))}
    ${group('Duración', chips('minutosChip', [[defaults.minMin || 20, `${defaults.minMin || 20} min · mínima`], [30, '30'], [45, '45'], [60, '60']], r.minutos) + `<input type="number" name="minutos" min="1" max="300" value="${r.minutos}" class="mt" aria-label="Minutos">`)}
    <div class="f">
      <div class="f-row"><span class="f-l">Ejercicios</span>${r.plan ? '' : '<button type="button" class="btn-text" data-copy-last>Copiar la última de este tipo</button>'}</div>
      ${r.plan ? '<p class="small muted ex-help">Carga total en kg (o color de banda) · repeticiones de cada serie separadas por / · RPE real.</p>' : ''}
      <div id="ex-list">${(r.ejercicios.length ? r.ejercicios : [{}]).map(exRow).join('')}</div>
      <button type="button" class="btn-text" data-ex-add>+ Agregar ejercicio</button>
      <datalist id="ex-names">${names.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
    </div>
    ${pd?.cierre?.length ? `<details class="guide"><summary>Vuelta a la calma</summary>${stepsList(pd.cierre)}</details>` : ''}
    ${pd?.minimo ? `<p class="plan-min"><b>Versión mínima:</b> ${esc(pd.minimo)}</p>` : ''}
    ${field('Molestias o dolor', `<textarea name="molestias" rows="2" placeholder="Ej.: tríceps izquierdo cargado">${esc(r.molestias || '')}</textarea>`, 'Si algo duele, anótalo: sirve para ajustar la progresión.')}
    ${field('Nota', `<textarea name="nota" rows="2">${esc(r.nota || '')}</textarea>`)}`;

  let saver = null;
  const fd = await sheet({
    title: editing ? 'Editar sesión' : pd ? 'Registrar sesión del plan' : r.extra ? 'Sesión adicional' : 'Registrar entrenamiento',
    body,
    danger: editing ? 'Eliminar' : null,
    onOpen: (dlg) => {
      const form = dlg.querySelector('form');
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
      saver = autosave(form, dkey, (f) => buildRecord(f, r));
    },
  });

  if (fd === 'descartar') { await saver.flush(); await clearDraft(dkey); return quick(rec, defaults); }
  if (!fd) {
    if (saver?.dirty()) { await saver.saveNow(); toast('Quedó guardado como borrador: ábrelo de nuevo para seguir'); return true; }
    await saver?.flush();
    return !!draft;
  }
  await saver.flush();
  if (fd === 'delete') { await del(STORE, r.id); await clearDraft(dkey); toast('Sesión eliminada'); return true; }

  const out = buildRecord(fd, r);
  const sinRpe = out.ejercicios.filter((e) => e.obj && e.rpe == null).map((e) => e.n);
  if (sinRpe.length && !confirm(`Sin RPE: ${sinRpe.join(', ')}.\n\nSi no hiciste esos ejercicios, quítalos con la ×. ¿Guardar así?`)) {
    await setMeta(`borrador:${dkey}`, { guardado: nowISO(), rec: out });
    return quick(rec, defaults);
  }
  await put(STORE, { ...out, id: r.id || uid(), creado: r.creado || nowISO(), editado: editing ? nowISO() : undefined });
  await clearDraft(dkey);
  toast(editing ? 'Sesión actualizada' : 'Entrenamiento registrado');
  return true;
}

const MEDIDAS = [
  ['peso', 'Peso (kg)'], ['cintura', 'Cintura (cm)'], ['pecho', 'Pecho (cm)'], ['cadera', 'Cadera (cm)'],
  ['brazoIzq', 'Brazo contraído izq. (cm)'], ['brazoDer', 'Brazo contraído der. (cm)'], ['musloIzq', 'Muslo izq. (cm)'], ['musloDer', 'Muslo der. (cm)'],
];
const medidaText = (r) => MEDIDAS.filter(([k]) => r[k] != null).map(([k, n]) => `${n.replace(/ \((kg|cm)\)/, '').toLowerCase()} ${num(r[k])}`).join(' · ') || '—';

async function medida(rec = null) {
  const r = rec || { fecha: today() };
  const fd = await sheet({
    title: rec ? 'Editar medida' : 'Registrar medidas',
    danger: rec ? 'Eliminar' : null,
    body: `${field('Fecha', `<input type="date" name="fecha" value="${r.fecha}" required>`)}
      <p class="small muted">En ayunas, después de ir al baño. Cintura a la altura del ombligo, al final de una exhalación normal.</p>
      <div class="grid2">${MEDIDAS.map(([k, n]) => field(n, `<input name="${k}" inputmode="decimal" value="${r[k] ?? ''}">`)).join('')}</div>
      ${field('Nota', `<input name="nota" value="${esc(r.nota || '')}">`)}`,
  });
  if (!fd) return false;
  if (fd === 'delete') { await del(STORE, r.id); return true; }
  const vals = Object.fromEntries(MEDIDAS.map(([k]) => [k, parseNum(fd.get(k))]));
  await put(STORE, { ...r, ...vals, id: r.id || uid(), kind: 'medida', fecha: fd.get('fecha'), nota: fd.get('nota').trim(), creado: r.creado || nowISO() });
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
        ${o.video ? `<a class="pe-v" href="${esc(o.video)}" target="_blank" rel="noopener">Ver técnica ↗</a>` : ''}
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
  const delDia = ses.filter((s) => s.fecha === viewDate && !s.extra).sort((a, b) => (b.editado || b.creado || '').localeCompare(a.editado || a.creado || ''));
  const doneOn = delDia[0] || null;
  const extras = ses.filter((s) => s.fecha === viewDate && s.extra);
  const isToday = viewDate === t;
  const draftDays = new Set((await draftKeys()).filter((k) => k.startsWith('cuerpo:nuevo:')).map((k) => k.slice(13, 23)));

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
        ${delDia.length > 1 ? `<div class="notice mt"><p><b>Hay ${delDia.length} registros para este día.</b> Revisa cuál es el correcto y elimina el que sobra (ábrelo y toca Eliminar). Si querías dos sesiones, marca la segunda como adicional.</p><div class="row">${delDia.map((x) => `<button class="btn sm" data-edit="${x.id}">${mins(x.minutos)} · ${(x.ejercicios || []).length} ej. · ${esc((x.editado || x.creado || '').slice(11, 16) || '')}</button>`).join('')}</div></div>` : ''}
        ${day ? `<div class="row mt">${doneOn ? `<button class="btn pri" data-edit="${doneOn.id}">Ver y editar lo registrado</button>` : `<button class="btn pri" data-act="plan">${draftDays.has(viewDate) ? 'Seguir registrando' : 'Registrar esta sesión'}</button>`}</div>` : ''}
        ${extras.length ? `<p class="small muted mt">Sesión adicional ese día: ${extras.map((x) => `<button class="btn-text" data-edit="${x.id}">${tipoName(x.tipo)} · ${mins(x.minutos)}</button>`).join(' ')}</p>` : ''}
        <details class="plan-more"><summary>Sobre este plan</summary>
          <p><b>${esc(plan.titulo || '')}</b> · vigente desde el ${fmtDate(plan.desde)}</p>
          ${plan.resumen ? `<p>${esc(plan.resumen)}</p>` : ''}
          ${plan.progresion ? `<p><b>Progresión:</b> ${esc(plan.progresion)}</p>` : ''}
          ${plan.reglas?.length ? `<p><b>Reglas:</b></p><ul>${plan.reglas.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
          ${plan.cambios?.length ? `<p><b>Cambios en esta versión:</b></p><ul>${plan.cambios.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
        </details>`
      : `<p class="empty">Aún no hay plan de entrenamiento. Cuando Claude te envíe el archivo del plan, impórtalo en <a href="#/datos">Datos</a>.</p>`}
    </section>

    <section class="sec">
      <h2>Progresión por ejercicio</h2>
      ${prog.length ? `<div class="tbl"><table><thead><tr><th>Ejercicio</th><th class="n">Última</th><th class="n">Mejor</th></tr></thead><tbody>
        ${prog.slice(0, 25).map((p) => `<tr><td>${esc(p.nombre)}<small>${fmtDate(p.ultima.fecha)} · ${p.veces} reg.</small></td>
          <td class="n">${loadText(p.ultima) || '—'}<small>${esc(p.ultima.series || '')}${p.ultima.rpe != null ? ` · RPE ${num(p.ultima.rpe)}` : ''}</small></td>
          <td class="n">${p.mejorKg != null ? `${num(p.mejorKg, 2)} kg` : '—'}</td></tr>`).join('')}
      </tbody></table></div>` : `<p class="empty">Cuando registres ejercicios con su carga, aquí verás la última carga y la mejor de cada uno.</p>`}
    </section>

    <section class="sec">
      <h2>Sesiones</h2>
      ${ses.length ? `<ul class="list">${ses.slice(0, 40).map((r) => `
        <li><button class="item" data-edit="${r.id}">
          <span class="item-t">${tipoName(r.tipo)} <span class="muted">· ${mins(r.minutos)}</span></span>
          <span class="item-s">${fmtDate(r.fecha)}${r.extra ? ' · adicional' : ''} · ${(r.ejercicios || []).length} ${(r.ejercicios || []).length === 1 ? 'ejercicio' : 'ejercicios'}${r.plan ? ` · plan v${r.plan.version}` : ''}${r.molestias ? ' · <span class="warn">molestias</span>' : ''}</span>
        </button></li>`).join('')}</ul>` : `<p class="empty">Sin sesiones todavía. La versión mínima también cuenta.</p>`}
    </section>

    <section class="sec">
      <h2>Medidas</h2>
      ${med.length ? `<ul class="list">${med.slice(0, 12).map((r) => `<li><button class="item" data-medida="${r.id}"><span class="item-t">${esc(medidaText(r))}</span><span class="item-s">${fmtDate(r.fecha)}${r.nota ? ' · ' + esc(r.nota) : ''}</span></button></li>`).join('')}</ul>` : `<p class="empty">Sin medidas registradas.</p>`}
    </section>`;

  root.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.day) { viewDate = b.dataset.day; app.refresh(); return; }
    let changed = false;
    if (b.dataset.act === 'add') changed = await freeSession(viewDate);
    else if (b.dataset.act === 'plan') changed = await openPlanSession(plan, viewDate);
    else if (b.dataset.act === 'medida') changed = await medida();
    else if (b.dataset.edit) changed = await quick(ses.find((x) => x.id === b.dataset.edit));
    else if (b.dataset.medida) changed = await medida(med.find((x) => x.id === b.dataset.medida));
    if (changed) app.refresh();
  };
}

const sessionOn = async (fecha) => (await all(STORE))
  .filter((s) => s.kind !== 'medida' && s.fecha === fecha && !s.extra)
  .sort((a, b) => (b.editado || b.creado || '').localeCompare(a.editado || a.creado || ''))[0] || null;

// Abre la sesión del plan para una fecha (usado también desde Hoy).
// Si ese día ya tiene sesión registrada, la abre para verla y editarla.
export async function openPlanSession(plan, fecha = today(), minutos = null) {
  const existing = await sessionOn(fecha);
  if (existing) return quick(existing);
  const day = dayOf(plan, fecha);
  if (!day) return quick(null, { ...(minutos ? { minutos } : {}), fecha });
  return quick(null, { planDay: day, planRef: { area: 'cuerpo', version: plan.version, dia: parseYmd(fecha).getDay() }, minutos, fecha, minMin: plan.minutosMinimo });
}

// Sesión fuera del plan. Si el día ya tiene sesión, pregunta si es adicional.
async function freeSession(fecha) {
  const existing = await sessionOn(fecha);
  if (!existing) return quick(null, { fecha });
  if (confirm(`Ya registraste la sesión del ${fmtDate(fecha)}.\n\nAceptar: registrar una sesión ADICIONAL al plan.\nCancelar: abrir la que ya registraste.`)) return quick(null, { fecha, extra: true });
  return quick(existing);
}
