# Logbuch

App personal para iPhone (web app instalable) que reúne el seguimiento de **Cuerpo**, **Idiomas**, **Carrera** y **Finanzas**, con exportación semanal para analizar el progreso con Claude.

- Sin dependencias ni compilación: HTML, CSS y JavaScript (módulos ES).
- Datos en el teléfono (IndexedDB), con migraciones versionadas y copias automáticas.
- Funciona sin conexión gracias al service worker.

## Empezar

```bash
python3 -m http.server 8000   # probar en http://localhost:8000
./scripts/check.sh            # revisar antes de publicar
./scripts/release.sh 1.1.0 "Descripción"   # publicar una versión nueva
git push && git push --tags
```

La guía completa (publicación en GitHub Pages, instalación en el iPhone, versionamiento y migraciones) está en [GUIA.md](GUIA.md). El historial de versiones está en [CHANGELOG.md](CHANGELOG.md).

> Los datos nunca se suben a este repositorio. No agregues copias (`logbuch-*.json`, `kassenbuch-*.json`) al repositorio.
