// Vista Hoy: los cuatro contenedores del día, la semana y las pausas.
// Los contenedores no tienen hora fija: se llenan cuando se pueda durante el día.
import { esc, today, fmtLong, dayShort, mins, pct, bar, weekStart, parseYmd } from '../util.js';
import { loadAll, minutesOn, weekSummary, gaps } from '../stats.js';
import { getSettings } from '../settings.js';
import { activePlans, dayOf, effectiveAreas } from '../plans.js';
import * as cuerpo from './cuerpo.js';
import * as idiomas from './idiomas.js';
import * as carrera from './carrera.js';

// plan: clave del plan que llena el contenedor (si existe)
const AREAS = [
  { k: 'ejercicio', plan: 'cuerpo', c: 'var(--c-ejercicio)', open: (m, P) => (P.cuerpo ? cuerpo.openPlanSession(P.cuerpo, today(), m) : cuerpo.quick(null, { minutos: m })) },
  { k: 'aleman', plan: 'de', c: 'var(--c-aleman)', open: (m, P) => (P.de ? idiomas.openPlanSession(P.de, 'de', today(), m) : idiomas.quick(null, { idioma: 'de', minutos: m })) },
  { k: 'ingles', plan: 'en', c: 'var(--c-ingles)', open: (m, P) => (P.en ? idiomas.openPlanSession(P.en, 'en', today(), m) : idiomas.quick(null, { idioma: 'en', minutos: m })) },
  { k: 'carrera', c: 'var(--c-pro)', open: (m) => carrera.quick(null, { minutos: m }) },
];

export async function render(root, app) {
  const [d, S0, P] = [await loadAll(), await getSettings(), await activePlans()];
  const S = { ...S0, areas: effectiveAreas(S0, P) };
  const t = today();
  const hoy = minutesOn(d, t);
  const w = weekSummary(d, weekStart());
  const g = gaps(d);
  const isWorkDay = parseYmd(t).getDay() === 5; // viernes: trabajo de clientes
  const paused = AREAS.filter((a) => g[a.k] == null || g[a.k] >= 3);

  const state = (a) => {
    const A = S.areas[a.k], m = hoy[a.k];
    if (m >= A.diario) return ['hecho', 'Hecho'];
    if (m >= A.minimo) return ['minima', 'Versión mínima'];
    if (m > 0) return ['parcial', 'Empezado'];
    return ['', 'Pendiente'];
  };
  const weekVal = (k) => (k === 'ejercicio' ? [w.ejercicio.sesiones, S.areas.ejercicio.semanaSesiones, `${w.ejercicio.sesiones}/${S.areas.ejercicio.semanaSesiones} sesiones`] : [w[k].minutos, S.areas[k].semanaMin, `${mins(w[k].minutos)} / ${mins(S.areas[k].semanaMin)}`]);

  root.innerHTML = `
    <p class="date">${fmtLong(t)}${isWorkDay ? ' · día de clientes' : ''}</p>

    ${paused.length ? `<section class="notice"><p><b>Retomar sin compensar.</b> ${paused.map((a) => `${esc(S.areas[a.k].nombre)} ${g[a.k] == null ? 'no tiene registros' : `lleva ${g[a.k]} días sin registro`}`).join('; ')}. Hoy basta con la versión mínima: no hay que recuperar lo perdido.</p></section>` : ''}

    <section class="sec">
      <h2>Contenedores de hoy</h2>
      <div class="boxes">${AREAS.map((a) => { const A = S.areas[a.k], [cls, lbl] = state(a); return `
        <article class="box ${cls}" style="--c:${a.c}">
          <header><b>${esc(A.nombre)}</b><span class="st">${lbl}</span></header>
          ${a.plan && P[a.plan] ? (dayOf(P[a.plan], t) ? `<p class="box-plan">${esc(dayOf(P[a.plan], t).titulo || '')}</p>` : '<p class="box-plan muted">Sin sesión en el plan hoy</p>') : ''}
          <p class="box-n">${mins(hoy[a.k])} <span>de ${mins(A.diario)}</span></p>
          ${bar(pct(hoy[a.k], A.diario))}
          <div class="row"><button class="btn sm" data-area="${a.k}" data-min="${A.minimo}">Mínima ${A.minimo}′</button><button class="btn sm pri" data-area="${a.k}" data-min="${A.diario}">Completa</button></div>
        </article>`; }).join('')}</div>
    </section>

    <section class="sec">
      <h2>La semana</h2>
      <div class="week">
        <div class="wk-row wk-h"><span></span>${w.perDay.map((x) => `<span class="${x.fecha === t ? 'today' : ''}">${dayShort(x.fecha)}</span>`).join('')}</div>
        ${AREAS.map((a) => `<div class="wk-row" style="--c:${a.c}"><span>${esc(S.areas[a.k].nombre)}</span>${w.perDay.map((x) => { const v = x[a.k], A = S.areas[a.k]; const cls = v >= A.diario ? 'full' : v >= A.minimo ? 'half' : v > 0 ? 'some' : x.fecha > t ? 'future' : ''; return `<i class="${cls}" title="${x.fecha}: ${mins(v)}"></i>`; }).join('')}</div>`).join('')}
      </div>
      <ul class="wk-tot">${AREAS.map((a) => { const [v, goal, txt] = weekVal(a.k); return `<li style="--c:${a.c}"><span>${esc(S.areas[a.k].nombre)}</span><b>${txt}</b>${bar(pct(v, goal))}</li>`; }).join('')}</ul>
    </section>

    <section class="sec">
      <h2>Análisis con Claude</h2>
      <p class="lede">Al final de la semana, comparte tu progreso con Claude para ajustar el plan de la siguiente.</p>
      <div class="row"><button class="btn pri" data-go="datos">Exportar para Claude</button></div>
    </section>`;

  root.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.go) { location.hash = '#/' + b.dataset.go; return; }
    const a = AREAS.find((x) => x.k === b.dataset.area);
    if (a && (await a.open(+b.dataset.min, P))) app.refresh();
  };
}
