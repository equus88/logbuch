// Exportación para el análisis semanal con Claude y copias de seguridad.
import { dumpAll, all } from './db.js';
import { APP_VERSION, SCHEMA_VERSION } from './version.js';
import { today, addDays, weekStart, mins, money, fmtDate } from './util.js';
import { loadAll, lastWeeks, gaps, exerciseProgress } from './stats.js';
import { getSettings } from './settings.js';
import { getConfig, statsOf, ladder, balance } from './modules/finanzas.js';

// Paquete compacto para Claude: últimas N semanas de registros + resúmenes.
export async function claudePackage({ semanas = 4, finanzas = true } = {}) {
  const d = await loadAll();
  const S = await getSettings();
  const desde = addDays(weekStart(), -7 * (semanas - 1));
  const rango = (rows) => rows.filter((r) => r.fecha >= desde);
  const strip = ({ creado, editado, ...r }) => r;
  const out = {
    app: 'logbuch',
    tipo: 'informe-claude',
    appVersion: APP_VERSION,
    schema: SCHEMA_VERSION,
    exportado: new Date().toISOString(),
    rango: { desde, hasta: today() },
    metas: S.areas,
    niveles: S.niveles,
    rutaProfesional: S.carrera.ruta,
    diasSinRegistrar: gaps(d),
    semanas: lastWeeks(d, semanas).map(({ perDay, ...w }) => ({ ...w, porDia: perDay })),
    cuerpo: rango(d.cuerpo).map(strip),
    progresionEjercicios: exerciseProgress(d).slice(0, 30),
    idiomas: rango(d.idiomas).map(strip),
    carrera: rango(d.carrera).map(strip),
    ofertas: d.ofertas.map(strip),
  };
  if (finanzas) {
    const c = await getConfig();
    const movs = (await all('finanzas')).filter((m) => m.fecha >= addDays(today(), -92));
    const L = ladder(c);
    out.finanzas = {
      balance: balance(c),
      pasoActual: L.cur ? { paso: L.cur.k, nombre: L.cur.n, falta: L.cur.falta } : null,
      fondos: c.fondos.map(({ id, n, saldo, meta, minimo, metaEUR }) => ({ id, n, saldo, meta, minimo, metaEUR })),
      deudas: c.deudas.map(({ id, n, tipo, moneda, saldo, tasaEA, cuota }) => ({ id, n, tipo, moneda, saldo, tasaEA, cuota })),
      resumenMes: statsOf(movs.filter((m) => m.fecha.slice(0, 7) === today().slice(0, 7))),
      movimientos90dias: movs.map(({ ef, creado, ...m }) => m),
    };
  }
  return out;
}

// Resumen en texto para pegar directamente en el chat con Claude.
export async function claudeText(opts = {}) {
  const p = await claudePackage(opts);
  const w = p.semanas[0], prev = p.semanas[1];
  const M = p.metas;
  const line = (n, cur, goal, extra = '') => `- ${n}: ${cur} de ${goal}${extra}`;
  const gap = (k) => { const n = p.diasSinRegistrar[k]; return n == null ? 'sin registros aún' : `último registro ${n === 0 ? 'hoy' : n === 1 ? 'ayer' : `hace ${n} días`}`; };
  const plural = (n, s, pl) => `${n} ${n === 1 ? s : pl}`;
  const L = [];
  L.push(`Logbuch v${p.appVersion} — semana del ${fmtDate(w.desde)} al ${fmtDate(w.hasta)} (exportado ${fmtDate(today())})`);
  L.push('');
  L.push('Esta semana:');
  L.push(line('Ejercicio', `${plural(w.ejercicio.sesiones, "sesión", "sesiones")} (${mins(w.ejercicio.minutos)})`, `${M.ejercicio.semanaSesiones}`, ` · ${gap('ejercicio')}`));
  L.push(line('Inglés', mins(w.ingles.minutos), mins(M.ingles.semanaMin), ` · ${gap('ingles')}`));
  L.push(line('Alemán', mins(w.aleman.minutos), mins(M.aleman.semanaMin), ` · ${gap('aleman')}`));
  L.push(line('Profesional', mins(w.carrera.minutos), mins(M.carrera.semanaMin), ` · ${plural(w.carrera.acciones, "acción", "acciones")} · ${gap('carrera')}`));
  if (prev) L.push(`Semana anterior: ejercicio ${prev.ejercicio.sesiones} sesiones, inglés ${mins(prev.ingles.minutos)}, alemán ${mins(prev.aleman.minutos)}, profesional ${mins(prev.carrera.minutos)}.`);
  const errs = p.idiomas.filter((r) => r.fecha >= w.desde).flatMap((r) => (r.errores || []).map((e) => `  - [${r.idioma}] ${e}`));
  if (errs.length) { L.push(''); L.push('Errores de idiomas de la semana:'); L.push(...errs.slice(0, 20)); }
  const mol = p.cuerpo.filter((r) => r.fecha >= w.desde && r.molestias);
  if (mol.length) { L.push(''); L.push('Molestias reportadas:'); mol.forEach((r) => L.push(`  - ${fmtDate(r.fecha)}: ${r.molestias}`)); }
  L.push('');
  L.push(`Ofertas clasificadas: ${p.ofertas.length} (con gusto ${p.ofertas.filter((o) => o.clasificacion === 'gusto').length}, sin más ${p.ofertas.filter((o) => o.clasificacion === 'sin_mas').length}, no ${p.ofertas.filter((o) => o.clasificacion === 'no').length}).`);
  if (p.finanzas) {
    const f = p.finanzas;
    L.push(`Finanzas del mes: ingresos ${money(f.resumenMes.ing)}, gastos ${money(f.resumenMes.gas)}, excedente ${money(f.resumenMes.excedente)}. Paso actual: ${f.pasoActual ? `${f.pasoActual.paso}. ${f.pasoActual.nombre} (faltan ${money(f.pasoActual.falta)})` : 'todos cumplidos'}.`);
  }
  L.push('');
  L.push('Analiza mi progreso de la semana y ajusta el cronograma de actividades y ejercicios de la próxima, teniendo en cuenta las pausas y cambios de rutina.');
  return L.join('\n');
}

export async function fullBackup() {
  return { app: 'logbuch', tipo: 'copia', appVersion: APP_VERSION, schema: SCHEMA_VERSION, fecha: new Date().toISOString(), data: await dumpAll() };
}
