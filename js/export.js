// Exportación para el análisis semanal con Claude y copias de seguridad.
import { dumpAll, all } from './db.js';
import { APP_VERSION, SCHEMA_VERSION } from './version.js';
import { today, addDays, weekStart, weekDays, mins, money, fmtDate, dayShort, num } from './util.js';
import { loadAll, lastWeeks, gaps, exerciseProgress } from './stats.js';
import { getSettings } from './settings.js';
import { allPlans, activePlan, dayOf, targetText, compare, effectiveAreas, AREAS_PLAN } from './plans.js';
import { getConfig, statsOf, ladder, balance } from './modules/finanzas.js';

// Paquete compacto para Claude: últimas N semanas de registros + resúmenes.
export async function claudePackage({ semanas = 4, finanzas = true } = {}) {
  const d = await loadAll();
  const S0 = await getSettings();
  const P = {};
  for (const a of Object.keys(AREAS_PLAN)) P[a] = await activePlan(a);
  const S = { ...S0, areas: effectiveAreas(S0, P) };
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
    planes: {
      vigentes: P,
      historial: (await allPlans()).map(({ area, version, desde, titulo }) => ({ area, version, desde, titulo })),
      cumplimiento: await adherence(d, desde),
    },
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

// Plan frente a lo realizado, día por día, en el rango
async function adherence(d, desde) {
  const out = [];
  const days = [];
  for (let f = desde; f <= today(); f = addDays(f, 1)) days.push(f);
  for (const area of Object.keys(AREAS_PLAN)) {
    for (const f of days) {
      const plan = await activePlan(area, f);
      const day = dayOf(plan, f);
      if (!day) continue;
      if (area === 'cuerpo') {
        const s = d.cuerpo.find((r) => r.kind !== 'medida' && r.fecha === f && !r.extra);
        out.push({
          area, fecha: f, plan: plan.version, sesion: day.titulo || day.tipo, opcional: day.opcional || undefined, hecha: !!s,
          minutos: s?.minutos ?? 0, molestias: s?.molestias || undefined,
          ejercicios: s ? day.ejercicios.map((o) => {
            const real = (s.ejercicios || []).find((e) => e.n.trim().toLowerCase() === o.n.trim().toLowerCase());
            return { n: o.n, objetivo: targetText(o), real: real ? { kg: real.kg, banda: real.banda, series: real.series, rpe: real.rpe } : null, estado: real ? compare(real, real.obj || o).estado : 'omitido' };
          }) : undefined,
        });
      } else {
        const s = d.idiomas.find((r) => r.idioma === area && r.fecha === f && !r.extra);
        out.push({
          area, fecha: f, plan: plan.version, sesion: day.titulo, opcional: day.opcional || undefined, hecha: !!s, minutos: s?.minutos ?? 0,
          bloques: s ? { hechos: s.bloques || null, plan: day.bloques.map((b) => b.n) } : undefined,
          evaluacion: day.evaluacion ? { n: day.evaluacion.n, aciertos: s?.aciertos ?? null, total: s?.total ?? day.evaluacion.total } : undefined,
          errores: s?.errores?.length ? s.errores : undefined,
        });
      }
    }
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
  if (prev) L.push(`Semana anterior: ejercicio ${plural(prev.ejercicio.sesiones, 'sesión', 'sesiones')}, inglés ${mins(prev.ingles.minutos)}, alemán ${mins(prev.aleman.minutos)}, profesional ${mins(prev.carrera.minutos)}.`);
  const errs = p.idiomas.filter((r) => r.fecha >= w.desde).flatMap((r) => (r.errores || []).map((e) => `  - [${r.idioma}] ${e}`));
  if (errs.length) { L.push(''); L.push('Errores de idiomas de la semana:'); L.push(...errs.slice(0, 20)); }
  const adh = p.planes.cumplimiento.filter((x) => x.fecha >= w.desde);
  for (const area of Object.keys(AREAS_PLAN)) {
    const rows = adh.filter((x) => x.area === area && (!x.opcional || x.hecha));
    const plan = p.planes.vigentes[area];
    if (!plan || !rows.length) continue;
    L.push('');
    L.push(`Plan de ${AREAS_PLAN[area].toLowerCase()} v${plan.version}: ${rows.filter((x) => x.hecha && !x.opcional).length} de ${rows.filter((x) => !x.opcional).length} sesiones planeadas hasta hoy${rows.some((x) => x.opcional) ? ' (más la opcional del domingo)' : ''}.`);
    for (const x of rows) {
      const head = `  - ${dayShort(x.fecha)} ${fmtDate(x.fecha).split(' ').slice(1).join(' ')} · ${x.sesion}: `;
      if (!x.hecha) { L.push(head + 'no registrada'); continue; }
      if (area === 'cuerpo') {
        L.push(head + `${mins(x.minutos)}${x.molestias ? ` · molestias: ${x.molestias}` : ''}`);
        for (const e of x.ejercicios || []) {
          const real = e.real ? [e.real.kg != null ? `${num(e.real.kg, 2)} kg` : e.real.banda ? `banda ${e.real.banda}` : '', e.real.series, e.real.rpe != null ? `RPE ${num(e.real.rpe)}` : ''].filter(Boolean).join(' · ') : 'no hecho';
          L.push(`      ${e.n}: objetivo ${e.objetivo} → ${real} (${e.estado})`);
        }
      } else {
        const ev = x.evaluacion?.aciertos != null ? ` · ${x.evaluacion.n}: ${x.evaluacion.aciertos}/${x.evaluacion.total}` : '';
        const bl = x.bloques?.hechos ? ` · bloques ${x.bloques.hechos.length}/${x.bloques.plan.length}` : '';
        L.push(head + `${mins(x.minutos)}${bl}${ev}`);
      }
    }
  }
  const med = p.cuerpo.filter((r) => r.kind === 'medida').sort((x, y) => (x.fecha < y.fecha ? 1 : -1))[0];
  if (med) {
    const campos = [['peso', 'peso', 'kg'], ['cintura', 'cintura', 'cm'], ['pecho', 'pecho', 'cm'], ['cadera', 'cadera', 'cm'], ['brazoIzq', 'brazo izq.', 'cm'], ['brazoDer', 'brazo der.', 'cm'], ['musloIzq', 'muslo izq.', 'cm'], ['musloDer', 'muslo der.', 'cm']];
    L.push('');
    L.push(`Última medición (${fmtDate(med.fecha)}): ${campos.filter(([k]) => med[k] != null).map(([k, n, u]) => `${n} ${num(med[k])} ${u}`).join(', ')}.`);
  }
  const mol = p.cuerpo.filter((r) => r.fecha >= w.desde && r.molestias);
  if (mol.length) { L.push(''); L.push('Molestias reportadas:'); mol.forEach((r) => L.push(`  - ${fmtDate(r.fecha)}: ${r.molestias}`)); }
  L.push('');
  L.push(`Ofertas clasificadas: ${p.ofertas.length} (con gusto ${p.ofertas.filter((o) => o.clasificacion === 'gusto').length}, sin más ${p.ofertas.filter((o) => o.clasificacion === 'sin_mas').length}, no ${p.ofertas.filter((o) => o.clasificacion === 'no').length}).`);
  if (p.finanzas) {
    const f = p.finanzas;
    L.push(`Finanzas del mes: ingresos ${money(f.resumenMes.ing)}, gastos ${money(f.resumenMes.gas)}, excedente ${money(f.resumenMes.excedente)}. Paso actual: ${f.pasoActual ? `${f.pasoActual.paso}. ${f.pasoActual.nombre} (faltan ${money(f.pasoActual.falta)})` : 'todos cumplidos'}.`);
  }
  L.push('');
  L.push('Analiza mi progreso frente a los planes y genera las versiones nuevas (archivo de plan para Logbuch) ajustando cargas, repeticiones y temas según los resultados, las pausas y las molestias.');
  return L.join('\n');
}

export async function fullBackup() {
  return { app: 'logbuch', tipo: 'copia', appVersion: APP_VERSION, schema: SCHEMA_VERSION, fecha: new Date().toISOString(), data: await dumpAll() };
}
