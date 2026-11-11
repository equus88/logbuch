// Planes de entrenamiento y estudio.
//
// Un plan es un documento con versión. Claude genera versiones nuevas a partir
// de tus registros y tú las importas en Datos. La app guarda todas las
// versiones: la vigente para una fecha es la de mayor versión cuyo "desde"
// ya llegó. Así el historial muestra cómo evolucionó el plan.
//
// Formato (ver también GUIA.md, sección "Planes"):
// {
//   area: 'cuerpo' | 'en' | 'de', version: 3, desde: 'AAAA-MM-DD',
//   titulo, resumen, cambios: ['qué cambió frente a la versión anterior'],
//   metaSemanal: { sesiones?, minutos? },
//   progresion: 'reglas para subir carga o pasar de tema', reglas: ['…'],
//   minutosMinimo: 25,
//   semana: { '1': Dia, ... '0': Dia }   // 0 = domingo … 6 = sábado (sin clave = descanso)
// }
// Dia de Cuerpo:   { titulo, tipo, minutos, calentamiento: [Paso], ejercicios: [Ejercicio], cierre: [Paso], minimo, nota }
//   Ejercicio:     { n, series, reps, kg?, carga?, banda?, rpe?, descanso?, nota?, video? }
//                  reps: 12 | '8-12' | '30-45 s' · kg: carga total en número (para comparar)
//                  carga: cómo se muestra ('7,25 kg c/u', 'Peso corporal') · rpe: 7 | '6-7'
//   Paso:          { n, dosis }
// Dia de idioma:   { titulo, minutos, bloques: [{ min, n, que }], evaluacion?: { n, total }, minimo, nota }
// Cualquier día puede llevar opcional: true (no cuenta como sesión pendiente).

import { db, put } from './db.js';
import { today, parseYmd } from './util.js';
import { SEEDS } from './plans-seed.js';

export const AREAS_PLAN = { cuerpo: 'Entrenamiento', en: 'Inglés', de: 'Alemán' };

function req(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }

export async function allPlans(area = null) {
  const d = await db();
  const s = d.transaction('planes').objectStore('planes');
  const rows = area ? await req(s.index('area').getAll(area)) : await req(s.getAll());
  return rows.sort((a, b) => a.area.localeCompare(b.area) || b.version - a.version);
}

export async function activePlan(area, fecha = today()) {
  const rows = (await allPlans(area)).filter((p) => p.desde <= fecha);
  return rows[0] || null;
}

export async function activePlans(fecha = today()) {
  const out = {};
  for (const a of Object.keys(AREAS_PLAN)) out[a] = await activePlan(a, fecha);
  return out;
}

// Sesión planeada para una fecha (o null si es día de descanso)
export function dayOf(plan, fecha = today()) {
  if (!plan || !plan.semana) return null;
  const d = plan.semana[String(parseYmd(fecha).getDay())];
  return d && (d.ejercicios?.length || d.bloques?.length || d.titulo) ? d : null;
}

// Día del plan con el que se registró una sesión (para mostrar su guía al editarla)
export async function planDayForRecord(rec) {
  if (!rec?.plan) return null;
  const p = (await allPlans(rec.plan.area)).find((x) => x.version === rec.plan.version);
  const d = p?.semana?.[String(rec.plan.dia)];
  return d || null;
}

// ---------- Validación e importación ----------
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

export function validatePlan(p) {
  const errs = [];
  if (!p || typeof p !== 'object') return ['No es un plan'];
  if (!AREAS_PLAN[p.area]) errs.push(`Área desconocida: ${p.area}`);
  if (!Number.isInteger(p.version) || p.version < 1) errs.push('La versión debe ser un número entero');
  if (!isDate(p.desde)) errs.push('Falta la fecha "desde" (AAAA-MM-DD)');
  if (!p.semana || typeof p.semana !== 'object') errs.push('Falta la semana');
  else {
    for (const [k, d] of Object.entries(p.semana)) {
      if (!/^[0-6]$/.test(k)) errs.push(`Día inválido: ${k}`);
      if (p.area === 'cuerpo' && d && !Array.isArray(d.ejercicios)) errs.push(`El día ${k} no tiene lista de ejercicios`);
      if (p.area !== 'cuerpo' && d && !Array.isArray(d.bloques)) errs.push(`El día ${k} no tiene bloques`);
    }
  }
  return errs;
}

export function plansFromFile(obj) {
  if (obj?.app !== 'logbuch' || obj.tipo !== 'plan') return null;
  return Array.isArray(obj.planes) ? obj.planes : obj.plan ? [obj.plan] : [];
}

export async function savePlan(p, origen = 'importado') {
  const rec = { ...p, id: `${p.area}@${p.version}`, importado: new Date().toISOString(), origen };
  await put('planes', rec);
  return rec;
}

// Inserta los planes de fábrica de las áreas que aún no tienen ninguno
export async function seedPlans() {
  for (const p of SEEDS) {
    if (!p) continue;
    const existing = await allPlans(p.area);
    if (!existing.some((x) => x.version === p.version)) {
      if (existing.length && existing[0].version > p.version) continue;
      await savePlan(p, 'de fábrica');
    }
  }
}

// ---------- Objetivo frente a lo realizado ----------
// reps "12" → [12,12]; "8-12" → [8,12]; "30 s" → null (por tiempo)
export function repsRange(reps) {
  if (typeof reps === 'number') return [reps, reps];
  const m = String(reps ?? '').match(/^\s*(\d+)\s*(?:[-–a]\s*(\d+))?\s*$/);
  return m ? [+m[1], +(m[2] || m[1])] : null;
}

export function targetText(e) {
  const parts = [];
  if (e.series || e.reps) parts.push(`${e.series ?? '?'}×${e.reps ?? '?'}`);
  if (e.carga) parts.push(e.carga);
  else {
    if (e.kg != null && e.kg !== '') parts.push(`${String(e.kg).replace('.', ',')} kg`);
    if (e.banda) parts.push(`banda ${e.banda}`);
  }
  if (e.rpe != null && e.rpe !== '') parts.push(`RPE ${e.rpe}`);
  return parts.join(' · ');
}

// Serie de repeticiones sugerida para el formulario: 3×12 → "12/12/12"
export function seriesString(e) {
  const r = repsRange(e.reps);
  if (!e.series) return '';
  const val = r ? r[0] : String(e.reps ?? '');
  return Array.from({ length: e.series }, () => val).join('/');
}

// Compara un ejercicio registrado con su objetivo
export function compare(real, obj) {
  if (!obj) return null;
  const sets = String(real.series || '').split(/[\/,;\s]+/).map((x) => parseFloat(x)).filter((x) => isFinite(x));
  const r = repsRange(obj.reps);
  const okSets = obj.series ? sets.length >= obj.series : true;
  const okReps = r ? sets.length > 0 && sets.slice(0, obj.series || sets.length).every((x) => x >= r[0]) : true;
  const okKg = obj.kg != null && obj.kg !== '' ? (real.kg ?? 0) >= +obj.kg : true;
  const rpeAlto = rpeMax(obj.rpe) != null && real.rpe != null && real.rpe > rpeMax(obj.rpe);
  const estado = okSets && okReps && okKg ? (rpeAlto ? 'exigente' : 'cumplido') : 'parcial';
  return { estado, okSets, okReps, okKg, rpeAlto };
}

// RPE 7 → 7; '6-7' → 7
export function rpeMax(rpe) {
  if (rpe == null || rpe === '') return null;
  const m = String(rpe).match(/(\d+(?:[.,]\d+)?)\s*$/);
  return m ? parseFloat(m[1].replace(',', '.')) : null;
}

export const ESTADO_TXT = { cumplido: 'Cumplido', exigente: 'Cumplido con RPE alto', parcial: 'Por debajo' };

// Metas semanales efectivas: las del plan vigente mandan sobre los ajustes
export function effectiveAreas(S, plans) {
  const A = structuredClone(S.areas);
  if (plans.cuerpo?.metaSemanal?.sesiones != null) A.ejercicio.semanaSesiones = plans.cuerpo.metaSemanal.sesiones;
  if (plans.cuerpo?.minutosMinimo != null) A.ejercicio.minimo = plans.cuerpo.minutosMinimo;
  if (plans.en?.minutosMinimo != null) A.ingles.minimo = plans.en.minutosMinimo;
  if (plans.de?.minutosMinimo != null) A.aleman.minimo = plans.de.minutosMinimo;
  if (plans.en?.metaSemanal?.minutos != null) A.ingles.semanaMin = plans.en.metaSemanal.minutos;
  if (plans.de?.metaSemanal?.minutos != null) A.aleman.semanaMin = plans.de.metaSemanal.minutos;
  return A;
}
