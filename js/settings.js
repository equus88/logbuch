// Ajustes con valores por defecto. Los ajustes guardados se mezclan con estos,
// así una versión nueva puede agregar ajustes sin romper los existentes.
import { getMeta, setMeta } from './db.js';

// Contenedores diarios del documento maestro (minutos por día de estudio)
// y metas semanales. Todo es editable en Datos → Metas.
export const DEFAULTS = {
  areas: {
    ejercicio: { nombre: 'Ejercicio', diario: 60, minimo: 20, semanaSesiones: 5 },
    aleman: { nombre: 'Alemán', diario: 45, minimo: 15, semanaMin: 270 },
    ingles: { nombre: 'Inglés', diario: 45, minimo: 15, semanaMin: 270 },
    carrera: { nombre: 'Profesional', diario: 60, minimo: 20, semanaMin: 240 },
  },
  niveles: {
    en: { actual: 'B1', meta: 'C1' },
    de: { actual: 'A1 en curso', meta: 'B1' },
  },
  carrera: {
    ruta: 'Analista de datos → Analytics Engineer → Lead → Head of Data',
    metaOfertas: 30,
  },
};

function merge(base, over) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return over ?? base;
  const out = { ...base };
  for (const k of Object.keys(over || {})) out[k] = k in base ? merge(base[k], over[k]) : over[k];
  return out;
}

export async function getSettings() {
  return merge(DEFAULTS, await getMeta('ajustes', {}));
}
export async function saveSettings(s) {
  await setMeta('ajustes', s);
}
