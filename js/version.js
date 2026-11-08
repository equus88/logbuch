// Versión de la app y del esquema de datos.
// APP_VERSION sigue SemVer (MAYOR.MENOR.PARCHE):
//   PARCHE → arreglos sin cambios visibles en los datos (1.0.0 → 1.0.1)
//   MENOR  → funciones nuevas compatibles (1.0.1 → 1.1.0)
//   MAYOR  → cambios que rompen el formato de exportación (1.4.0 → 2.0.0)
// SCHEMA_VERSION solo sube cuando cambia la estructura de la base de datos
// (nuevo almacén, nuevo índice o una transformación de registros). Ver js/db.js.
// Usa scripts/release.sh para subir la versión: también actualiza sw.js.
export const APP_VERSION = '1.0.0';
export const SCHEMA_VERSION = 1;
export const BUILD_DATE = '2026-11-08';
