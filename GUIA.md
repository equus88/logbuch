# Guía de Logbuch: de cero a tu iPhone

Esta guía explica cómo funciona la app, cómo publicarla, cómo instalarla en tu iPhone y cómo sacar versiones nuevas sin perder lo que registres.

---

## 1. Cómo funciona

Logbuch es una **web app instalable (PWA)**: HTML, CSS y JavaScript sin frameworks ni dependencias. Se publica gratis en GitHub Pages y se agrega a la pantalla de inicio del iPhone, donde abre a pantalla completa y funciona sin conexión.

Tres piezas:

| Pieza | Archivo | Qué hace |
|---|---|---|
| La app | `index.html`, `css/`, `js/` | Interfaz y lógica de los módulos |
| El service worker | `sw.js` | Guarda la app en el teléfono para abrir sin internet y detecta versiones nuevas |
| La base de datos | IndexedDB, dentro del iPhone | Guarda tus registros. **No está en GitHub ni en ningún servidor** |

Lo importante: **el código y los datos viven separados**. Cuando publicas una versión nueva, cambia el código y la base de datos queda intacta. Por eso puedes mejorar la app tantas veces como quieras.

### Estructura del proyecto

```
logbuch/
├── index.html              Estructura de la página y barra de módulos
├── manifest.webmanifest    Nombre, ícono y modo pantalla completa
├── sw.js                   Service worker (caché y actualizaciones)
├── css/app.css             Estilos (claro y oscuro)
├── icons/                  Íconos de la app
├── js/
│   ├── app.js              Arranque, rutas y aviso de actualización
│   ├── version.js          Versión de la app y del esquema de datos
│   ├── db.js               Base de datos, migraciones y copias automáticas
│   ├── settings.js         Metas y contenedores (editables en la app)
│   ├── stats.js            Cálculos de progreso semanal
│   ├── export.js           Exportación para Claude y copias
│   ├── util.js             Fechas, formato, formularios
│   └── modules/            Un archivo por módulo
│       ├── hoy.js  cuerpo.js  idiomas.js  carrera.js  finanzas.js  datos.js
├── scripts/
│   ├── check.sh            Revisión antes de publicar
│   └── release.sh          Sube la versión, actualiza el historial y etiqueta en git
├── CHANGELOG.md            Historial de versiones
└── GUIA.md                 Esta guía
```

---

## 2. Preparar el Mac (una sola vez)

1. **Git.** Abre Terminal y ejecuta:
   ```bash
   xcode-select --install
   ```
   Si ya está instalado, te lo dirá. Comprueba con `git --version`.
2. **Tu identidad en git:**
   ```bash
   git config --global user.name "Camilo Buitrago"
   git config --global user.email "tu-correo@ejemplo.com"
   ```
3. **Cuenta de GitHub** en github.com, si no la tienes.
4. **Editor.** Recomiendo Visual Studio Code (gratis). Cualquier editor sirve.
5. **Safari para depurar.** Safari → Ajustes → Avanzado → activa *Mostrar funciones para desarrolladores web*.

---

## 3. Probar la app en el Mac

Descomprime `logbuch.zip` donde guardes tus proyectos, por ejemplo `~/Proyectos/logbuch`. Luego:

```bash
cd ~/Proyectos/logbuch
python3 -m http.server 8000
```

Abre `http://localhost:8000` en Safari o Chrome. Ya puedes registrar datos de prueba. Para detener el servidor, pulsa `Ctrl + C` en la Terminal.

> Los datos que registres en el Mac se quedan en el Mac. Son independientes de los del iPhone, así que úsalo como entorno de pruebas.

Revisa que todo esté en orden antes de publicar:

```bash
./scripts/check.sh
```

---

## 4. Publicar en GitHub Pages

El proyecto ya viene con git inicializado y la versión `v1.0.0` etiquetada.

1. En GitHub, crea un repositorio nuevo llamado **`logbuch`**, **público** y **vacío** (sin README ni licencia).
   - GitHub Pages es gratis en repositorios públicos. El código queda a la vista, pero **tus datos no**: nunca salen del teléfono.
2. Conecta y sube (cambia `TU_USUARIO`):
   ```bash
   cd ~/Proyectos/logbuch
   git remote add origin https://github.com/TU_USUARIO/logbuch.git
   git push -u origin main
   git push --tags
   ```
   Si te pide contraseña, GitHub exige un *token*: en GitHub → Settings → Developer settings → Personal access tokens, crea uno con permiso `repo` y úsalo como contraseña. Otra opción más cómoda es instalar GitHub Desktop.
3. En el repositorio: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save.**
4. En uno o dos minutos la app queda en:
   ```
   https://TU_USUARIO.github.io/logbuch/
   ```

> ⚠️ **Esa URL es la casa de tus datos.** El iPhone guarda la base de datos ligada a esa dirección. Si cambias el nombre del repositorio o de tu usuario, la URL cambia y la app nueva abre vacía (los datos siguen en la dirección vieja). Si algún día necesitas cambiarla: guarda una copia en la app vieja, instala la nueva y restaura la copia.

---

## 5. Instalar en el iPhone

1. Abre **Safari** en el iPhone y entra a `https://TU_USUARIO.github.io/logbuch/`.
2. Toca **Compartir** (cuadro con flecha) → **Agregar a pantalla de inicio** → **Agregar**.
3. Abre Logbuch **siempre desde el ícono**.

> En iOS, la app instalada tiene su propio almacenamiento, separado de las pestañas de Safari. Lo que registres en una pestaña de Safari no aparece en la app instalada, y al revés.

Comprueba en **Datos → Versión** que diga *Instalada en inicio: Sí*.

---

## 6. Primer uso

1. **Traer tus finanzas del Kassenbuch.** En el Kassenbuch, ve a Ajustes y toca **Copia de seguridad (JSON)**. Guárdala en Archivos (o iCloud Drive). En Logbuch: **Datos → Restaurar o importar** y elige ese archivo. Se importan saldos, fondos, deudas y movimientos.
2. **Revisar las metas.** En **Datos → Editar metas y contenedores** están los minutos del documento maestro (ejercicio 60, alemán 45, inglés 45, profesional 60), la versión mínima de cada uno y las metas semanales. Ajústalos si no coinciden con tu plan actual.
3. **Revisar saldos.** En **Finanzas → Saldos** confirma el disponible, la TRM y la tasa del euro. La tasa del euro es necesaria para calcular el paso 5 (fondo de Alemania).

### Cómo está pensado el uso diario

- **Hoy** muestra los cuatro contenedores del día, sin horas fijas. Se llenan cuando puedas.
- Cada contenedor tiene dos botones: **Mínima** (15–20 min) y **Completa**. La versión mínima cuenta como día cumplido a medias. Sirve para no romper la cadena los días en que te levantas tarde.
- Si un área lleva 3 días o más sin registros, aparece un aviso para **retomar sin compensar**: no se trata de recuperar lo perdido, sino de volver con la versión mínima.
- Registrar algo toma menos de 30 segundos. En Cuerpo, **Copiar la última de este tipo** rellena los ejercicios de tu sesión anterior para solo cambiar las cargas.

---

## 7. El análisis semanal conmigo

Cada domingo (o cuando quieras revisar):

1. **Datos → Exportar para Claude → Copiar resumen.**
2. Pégalo en el chat del proyecto (Vida y carrera, Idiomas o Cuerpo, según lo que quieras ajustar).
3. Para un análisis más fino, toca también **Compartir archivo** y adjunta el JSON. Incluye cada sesión, ejercicio, error y movimiento del rango elegido.
4. Con mis ajustes, actualiza **Datos → Metas** para que la app refleje el plan nuevo.
5. Toca **Guardar copia** y guárdala en iCloud Drive. Es tu respaldo si borras la app o cambias de teléfono.

---

## 8. Versionamiento

### Qué significa cada número

Logbuch usa **SemVer**: `MAYOR.MENOR.PARCHE`.

| Cambio | Ejemplo | Sube |
|---|---|---|
| Arreglas un error o un texto | Corregir un cálculo | `1.0.0 → 1.0.1` |
| Agregas una función compatible | Módulo de hábitos, gráficas | `1.0.1 → 1.1.0` |
| Cambias algo que rompe el formato de exportación | Reorganizar todo el JSON | `1.4.0 → 2.0.0` |

Además está `SCHEMA_VERSION`, la versión de la **estructura de la base de datos**. Solo sube cuando cambia esa estructura (ver sección 9). La mayoría de las versiones no la tocan.

### El flujo para cada versión nueva

```bash
# 1. Haz los cambios y pruébalos en el Mac
python3 -m http.server 8000

# 2. Revisa y publica la versión (ejemplo: 1.1.0)
./scripts/release.sh 1.1.0 "Gráficas de progreso semanal"

# 3. Sube a GitHub
git push && git push --tags
```

`release.sh` revisa que no falte ningún archivo, actualiza la versión en `js/version.js` y `sw.js`, agrega la entrada al `CHANGELOG.md` y crea el commit con la etiqueta `v1.1.0`.

### Qué pasa en el iPhone

1. Al abrir la app, el service worker detecta que hay una versión nueva y la descarga en segundo plano.
2. Aparece el aviso **"Hay una versión nueva de Logbuch. Tus datos se conservan."** con el botón **Actualizar**.
3. Al tocarlo, la app se recarga con la versión nueva. Antes de usarla, guarda una **copia automática** dentro del teléfono (Datos → Copias automáticas; se conservan las últimas 5).

Si no aparece el aviso, cierra la app desde el selector de apps y ábrela de nuevo, o usa **Datos → Buscar actualización**.

### Volver a una versión anterior

Cada versión queda etiquetada en git. Para volver a la `v1.0.0` sin borrar el historial:

```bash
git revert --no-edit HEAD     # deshace el último commit creando uno nuevo
./scripts/release.sh 1.1.1 "Revierte el cambio de la 1.1.0"
git push && git push --tags
```

La versión siempre debe subir, aunque el código vuelva atrás. Si la versión baja o se repite, el iPhone no detecta el cambio.

---

## 9. Cambiar la estructura de los datos sin perder nada

Esta es la parte que protege tus registros a largo plazo. Hay tres casos:

**a) Agregar un campo opcional** (ej.: "energía del día" en las sesiones). No necesita migración. Los registros viejos no lo tienen, así que el código debe tolerar que falte:
```js
const energia = r.energia ?? null;
```

**b) Crear un almacén o índice nuevo** (ej.: módulo de hábitos). En `js/version.js` sube `SCHEMA_VERSION` a `2` y en `js/db.js` agrega:
```js
const MIGRATIONS = {
  1: (db) => { /* ...no la toques... */ },
  2: (db) => {
    db.createObjectStore('habitos', { keyPath: 'id' }).createIndex('fecha', 'fecha');
  },
};
```
Agrega `'habitos'` a la lista `STORES` en el mismo archivo.

**c) Transformar registros existentes** (ej.: renombrar un campo). Sube `SCHEMA_VERSION` y agrega la transformación en `RECORD_UPGRADES`:
```js
const RECORD_UPGRADES = {
  2: { idiomas: (r) => ({ ...r, nivel: r.nivel ?? null }) },
};
```
Esa función se aplica a tu base al actualizar y también a copias viejas cuando las restauras, así una copia de hoy sigue sirviendo dentro de un año.

### Las cuatro reglas

1. **Nunca edites una migración ya publicada.** Agrega una nueva con el número siguiente.
2. **Nunca renombres ni borres un campo sin su transformación** en `RECORD_UPGRADES`.
3. **Prueba con tus datos reales antes de publicar:** guarda una copia en el iPhone, pásala al Mac, impórtala en `localhost` con la versión nueva y revisa que todo se vea bien.
4. Antes de cualquier migración, la app guarda una copia automática. Aun así, guarda tu copia manual antes de actualizar si la versión cambia el esquema.

`./scripts/check.sh` revisa que exista la migración de la `SCHEMA_VERSION` actual.

---

## 10. Agregar un módulo nuevo

1. Crea `js/modules/<nombre>.js` con una función `render(root, app)`. Copia `carrera.js` como plantilla.
2. Regístralo en `ROUTES` dentro de `js/app.js`.
3. Agrega su enlace en la barra de `index.html` (o en Datos si no cabe en la barra).
4. Si guarda datos propios, crea su almacén con una migración (sección 9b).
5. Agrega el archivo a la lista `SHELL` de `sw.js`. Si lo olvidas, `check.sh` lo avisa.
6. Incluye sus datos en `js/export.js` para que lleguen al análisis semanal.

Para pedirme una función nueva: describe el requisito y, si el cambio toca archivos existentes, adjúntalos (o el `.zip` del proyecto). Te devuelvo los archivos modificados y tú ejecutas el paso de publicación.

---

## 11. Problemas comunes

| Síntoma | Causa probable | Solución |
|---|---|---|
| La app instalada abre vacía | La abriste desde Safari en vez del ícono, o cambió la URL | Usa el ícono; si cambió la URL, restaura una copia |
| No aparece la versión nueva | El iPhone aún tiene la anterior en caché | Cierra y abre la app, o Datos → Buscar actualización |
| `git push` pide contraseña y falla | GitHub ya no acepta contraseñas | Usa un token personal o GitHub Desktop |
| La página en GitHub da 404 | Pages no está activado o aún publica | Revisa Settings → Pages y espera un par de minutos |
| `check.sh` dice "Falta en sw.js" | Agregaste un archivo nuevo | Agrégalo a `SHELL` en `sw.js` |

iOS no borra los datos de una app instalada en la pantalla de inicio por falta de uso. Pero si borras el ícono, la base de datos se borra con él. **La copia semanal en iCloud Drive es tu respaldo real.**

---

## 12. Hoja de ruta sugerida

- **v1.1** — Módulo **Fahrplan**: el planificador semanal dentro de la app, conectado a los contenedores de Hoy.
- **v1.2** — Gráficas de tendencia por semana (minutos, cargas, aciertos).
- **v1.3** — Repaso de errores de idiomas tipo tarjetas (repetición espaciada con tu propio registro de errores).
- **v1.4** — Escenarios financieros del Kassenbuch (simulación de mudanza y fondo de Alemania).

Sube una versión a la vez y úsala al menos una semana antes de la siguiente.
