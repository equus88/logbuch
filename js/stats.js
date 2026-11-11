// Cálculos de progreso compartidos por Hoy, los módulos y la exportación.
import { all } from './db.js';
import { today, weekStart, weekDays, addDays, daysBetween } from './util.js';

export async function loadAll() {
  const [cuerpo, idiomas, carrera, ofertas] = await Promise.all([all('cuerpo'), all('idiomas'), all('carrera'), all('ofertas')]);
  return { cuerpo, idiomas, carrera, ofertas };
}

const sesiones = (d) => d.cuerpo.filter((r) => r.kind !== 'medida');

// Minutos registrados por área en una fecha
export function minutesOn(d, fecha) {
  const sum = (rows) => rows.reduce((a, r) => a + (+r.minutos || 0), 0);
  return {
    ejercicio: sum(sesiones(d).filter((r) => r.fecha === fecha)),
    aleman: sum(d.idiomas.filter((r) => r.fecha === fecha && r.idioma === 'de')),
    ingles: sum(d.idiomas.filter((r) => r.fecha === fecha && r.idioma === 'en')),
    carrera: sum(d.carrera.filter((r) => r.fecha === fecha)),
  };
}

export function weekSummary(d, start = weekStart()) {
  const days = weekDays(start);
  const end = days[6];
  const inWeek = (r) => r.fecha >= start && r.fecha <= end;
  const ses = sesiones(d).filter(inWeek);
  const idi = d.idiomas.filter(inWeek);
  const car = d.carrera.filter(inWeek);
  const sum = (rows) => rows.reduce((a, r) => a + (+r.minutos || 0), 0);
  const perDay = days.map((f) => ({ fecha: f, ...minutesOn(d, f) }));
  return {
    desde: start,
    hasta: end,
    perDay,
    // Una sesión por día; las adicionales suman minutos pero no sesiones del plan
    ejercicio: { sesiones: new Set(ses.filter((r) => !r.extra).map((r) => r.fecha)).size, adicionales: ses.filter((r) => r.extra).length, minutos: sum(ses), dias: new Set(ses.map((r) => r.fecha)).size },
    aleman: { sesiones: new Set(idi.filter((r) => r.idioma === 'de' && !r.extra).map((r) => r.fecha)).size, minutos: sum(idi.filter((r) => r.idioma === 'de')) },
    ingles: { sesiones: new Set(idi.filter((r) => r.idioma === 'en' && !r.extra).map((r) => r.fecha)).size, minutos: sum(idi.filter((r) => r.idioma === 'en')) },
    carrera: { acciones: car.length, minutos: sum(car) },
    ofertasNuevas: d.ofertas.filter(inWeek).length,
  };
}

export function lastDates(d) {
  const last = (rows) => rows.reduce((m, r) => (r.fecha > m ? r.fecha : m), '');
  return {
    ejercicio: last(sesiones(d)) || null,
    aleman: last(d.idiomas.filter((r) => r.idioma === 'de')) || null,
    ingles: last(d.idiomas.filter((r) => r.idioma === 'en')) || null,
    carrera: last(d.carrera) || null,
  };
}

export function gaps(d) {
  const L = lastDates(d), t = today(), out = {};
  for (const k of Object.keys(L)) out[k] = L[k] ? daysBetween(L[k], t) : null;
  return out;
}

export function lastWeeks(d, n = 4) {
  const out = [];
  let s = weekStart();
  for (let i = 0; i < n; i++) { out.push(weekSummary(d, s)); s = addDays(s, -7); }
  return out;
}

// Última carga registrada por ejercicio (para progresión)
export function exerciseProgress(d) {
  const map = new Map();
  const rows = sesiones(d).slice().sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  for (const r of rows) {
    for (const e of r.ejercicios || []) {
      const key = (e.n || '').trim().toLowerCase();
      if (!key) continue;
      const cur = map.get(key) || { nombre: e.n.trim(), veces: 0, mejorKg: null };
      cur.veces++;
      cur.ultima = { fecha: r.fecha, kg: e.kg, series: e.series, rpe: e.rpe };
      if (e.kg != null && (cur.mejorKg == null || e.kg > cur.mejorKg)) cur.mejorKg = e.kg;
      map.set(key, cur);
    }
  }
  return [...map.values()].sort((a, b) => (a.ultima.fecha < b.ultima.fecha ? 1 : -1));
}
