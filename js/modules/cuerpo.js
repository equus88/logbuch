// Módulo Cuerpo: sesiones de entrenamiento, cargas por ejercicio y medidas.
import { all, put, del } from '../db.js';
import { esc, uid, nowISO, today, fmtDate, mins, chips, field, group, sheet, toast, parseNum, num, weekStart, bar, pct } from '../util.js';
import { loadAll, weekSummary, exerciseProgress } from '../stats.js';
import { getSettings } from '../settings.js';

const STORE = 'cuerpo';
export const TIPOS = [
  ['gluteo', 'Glúteo y piernas'],
  ['empuje', 'Empuje'],
  ['tiron', 'Tirón'],
  ['core', 'Core'],
  ['completo', 'Cuerpo completo'],
  ['movilidad', 'Movilidad'],
];
const tipoName = (v) => (TIPOS.find((t) => t[0] === v) || [v, v])[1];

function exRow(e = {}) {
  return `<div class="ex-row">
    <input name="ex_n" placeholder="Ejercicio" value="${esc(e.n || '')}" aria-label="Ejercicio" list="ex-names">
    <input name="ex_kg" inputmode="decimal" placeholder="kg extra" value="${e.kg ?? ''}" aria-label="Carga en kg">
    <input name="ex_series" placeholder="Series: 12/12/12" value="${esc(e.series || '')}" aria-label="Series y repeticiones">
    <input name="ex_rpe" inputmode="decimal" placeholder="RPE" value="${e.rpe ?? ''}" aria-label="RPE">
    <button type="button" class="btn-icon" data-ex-del aria-label="Quitar ejercicio">×</button>
  </div>`;
}

export async function quick(rec = null, defaults = {}) {
  const editing = !!rec;
  const r = rec || { fecha: today(), tipo: defaults.tipo || 'gluteo', minutos: defaults.minutos || 60, ejercicios: [] };
  const rows = await all(STORE);
  const names = [...new Set(rows.flatMap((x) => (x.ejercicios || []).map((e) => e.n)).filter(Boolean))];
  const body = `
    ${field('Fecha', `<input type="date" name="fecha" value="${r.fecha}" required>`)}
    ${group('Tipo de sesión', chips('tipo', TIPOS, r.tipo, { required: true }))}
    ${group('Duración', chips('minutosChip', [[20, '20 min · mínima'], [30, '30'], [45, '45'], [60, '60']], r.minutos) + `<input type="number" name="minutos" min="1" max="300" value="${r.minutos}" class="mt" aria-label="Minutos">`)}
    <div class="f">
      <div class="f-row"><span class="f-l">Ejercicios</span><button type="button" class="btn-text" data-copy-last>Copiar la última de este tipo</button></div>
      <div class="ex-head"><span>Ejercicio</span><span>kg</span><span>Series</span><span>RPE</span><span></span></div>
      <div id="ex-list">${(r.ejercicios.length ? r.ejercicios : [{}]).map(exRow).join('')}</div>
      <button type="button" class="btn-text" data-ex-add>+ Agregar ejercicio</button>
      <datalist id="ex-names">${names.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
    </div>
    ${field('Molestias o dolor', `<textarea name="molestias" rows="2" placeholder="Ej.: tríceps izquierdo cargado">${esc(r.molestias || '')}</textarea>`, 'Si algo duele, anótalo: sirve para ajustar la progresión.')}
    ${field('Nota', `<textarea name="nota" rows="2">${esc(r.nota || '')}</textarea>`)}`;

  const fd = await sheet({
    title: editing ? 'Editar sesión' : 'Registrar entrenamiento',
    body,
    danger: editing ? 'Eliminar' : null,
    onOpen: (dlg) => {
      const list = dlg.querySelector('#ex-list');
      const minInput = dlg.querySelector('[name=minutos]');
      dlg.querySelectorAll('[name=minutosChip]').forEach((c) => c.addEventListener('change', () => { minInput.value = c.value; }));
      dlg.querySelector('[data-ex-add]').onclick = () => list.insertAdjacentHTML('beforeend', exRow());
      list.addEventListener('click', (e) => { if (e.target.matches('[data-ex-del]')) e.target.closest('.ex-row').remove(); });
      dlg.querySelector('[data-copy-last]').onclick = () => {
        const tipo = dlg.querySelector('[name=tipo]:checked')?.value;
        const last = rows.find((x) => x.kind !== 'medida' && x.tipo === tipo && x.id !== r.id);
        if (!last) { toast('Aún no hay sesiones de ese tipo'); return; }
        list.innerHTML = (last.ejercicios || []).map(exRow).join('') || exRow();
        toast(`Copiada la sesión del ${fmtDate(last.fecha)}`);
      };
    },
  });
  if (!fd) return false;
  if (fd === 'delete') { await del(STORE, r.id); toast('Sesión eliminada'); return true; }

  const n = fd.getAll('ex_n'), kg = fd.getAll('ex_kg'), se = fd.getAll('ex_series'), rpe = fd.getAll('ex_rpe');
  const ejercicios = n.map((x, i) => ({ n: x.trim(), kg: parseNum(kg[i]), series: se[i].trim(), rpe: parseNum(rpe[i]) })).filter((e) => e.n);
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

export async function render(root, app) {
  const [d, S] = [await loadAll(), await getSettings()];
  const A = S.areas.ejercicio;
  const w = weekSummary(d, weekStart());
  const ses = d.cuerpo.filter((r) => r.kind !== 'medida');
  const med = d.cuerpo.filter((r) => r.kind === 'medida');
  const prog = exerciseProgress(d);

  root.innerHTML = `
    <section class="hero" style="--c:var(--c-ejercicio)">
      <p class="eyebrow">Esta semana</p>
      <p class="hero-n"><b>${w.ejercicio.sesiones}</b> de ${A.semanaSesiones} sesiones · ${mins(w.ejercicio.minutos)}</p>
      ${bar(pct(w.ejercicio.sesiones, A.semanaSesiones))}
      <div class="row mt"><button class="btn pri" data-act="add">Registrar entrenamiento</button><button class="btn" data-act="medida">Medidas</button></div>
    </section>

    <section class="sec">
      <h2>Progresión por ejercicio</h2>
      ${prog.length ? `<div class="tbl"><table><thead><tr><th>Ejercicio</th><th class="n">Última</th><th class="n">Mejor</th></tr></thead><tbody>
        ${prog.slice(0, 25).map((p) => `<tr><td>${esc(p.nombre)}<small>${fmtDate(p.ultima.fecha)} · ${p.veces} reg.</small></td>
          <td class="n">${p.ultima.kg != null ? `+${num(p.ultima.kg, 2)} kg` : '—'}<small>${esc(p.ultima.series || '')}${p.ultima.rpe != null ? ` · RPE ${num(p.ultima.rpe)}` : ''}</small></td>
          <td class="n">${p.mejorKg != null ? `+${num(p.mejorKg, 2)} kg` : '—'}</td></tr>`).join('')}
      </tbody></table></div>` : `<p class="empty">Cuando registres ejercicios con su carga, aquí verás la última carga y la mejor de cada uno.</p>`}
    </section>

    <section class="sec">
      <h2>Sesiones</h2>
      ${ses.length ? `<ul class="list">${ses.slice(0, 40).map((r) => `
        <li><button class="item" data-edit="${r.id}">
          <span class="item-t">${tipoName(r.tipo)} <span class="muted">· ${mins(r.minutos)}</span></span>
          <span class="item-s">${fmtDate(r.fecha)} · ${(r.ejercicios || []).length} ejercicios${r.molestias ? ' · <span class="warn">molestias</span>' : ''}</span>
        </button></li>`).join('')}</ul>` : `<p class="empty">Sin sesiones todavía. La versión mínima de 20 minutos también cuenta.</p>`}
    </section>

    <section class="sec">
      <h2>Medidas</h2>
      ${med.length ? `<ul class="list">${med.slice(0, 12).map((r) => `<li><button class="item" data-medida="${r.id}"><span class="item-t">${r.peso != null ? `${num(r.peso)} kg` : '—'}${r.cintura != null ? ` · cintura ${num(r.cintura)} cm` : ''}</span><span class="item-s">${fmtDate(r.fecha)}${r.nota ? ' · ' + esc(r.nota) : ''}</span></button></li>`).join('')}</ul>` : `<p class="empty">Sin medidas registradas.</p>`}
    </section>`;

  root.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    let changed = false;
    if (b.dataset.act === 'add') changed = await quick();
    else if (b.dataset.act === 'medida') changed = await medida();
    else if (b.dataset.edit) changed = await quick(ses.find((x) => x.id === b.dataset.edit));
    else if (b.dataset.medida) changed = await medida(med.find((x) => x.id === b.dataset.medida));
    if (changed) app.refresh();
  };
}
