#!/usr/bin/env bash
# Publica una versión nueva de Logbuch.
# Uso:  ./scripts/release.sh 1.1.0 "Módulo de hábitos"
#
# Hace cuatro cosas:
#   1. Verifica que todos los archivos de la app estén en la lista de sw.js
#   2. Sube la versión en js/version.js y sw.js (y la fecha)
#   3. Agrega la entrada al CHANGELOG.md
#   4. Crea el commit y la etiqueta de git (vX.Y.Z)
# Después solo falta:  git push && git push --tags
set -euo pipefail
cd "$(dirname "$0")/.."

NEW="${1:-}"
MSG="${2:-}"
if [[ ! "$NEW" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Uso: ./scripts/release.sh MAYOR.MENOR.PARCHE \"descripción\"" >&2
  exit 1
fi
OLD=$(perl -ne "print \$1 if /APP_VERSION = '([^']+)'/" js/version.js)
if [[ "$OLD" == "$NEW" ]]; then echo "La versión $NEW ya está puesta." >&2; exit 1; fi

./scripts/check.sh

TODAY=$(date +%F)
perl -pi -e "s/APP_VERSION = '[^']+'/APP_VERSION = '$NEW'/; s/BUILD_DATE = '[^']+'/BUILD_DATE = '$TODAY'/" js/version.js
perl -pi -e "s/const VERSION = '[^']+'/const VERSION = '$NEW'/" sw.js

ENTRY="## v$NEW — $TODAY\n\n- ${MSG:-Describe aquí los cambios}\n"
perl -0pi -e "s/(# Historial de cambios\n\n)/\$1$ENTRY\n/" CHANGELOG.md

echo "Versión $OLD → $NEW"
if git rev-parse --git-dir >/dev/null 2>&1; then
  git add -A
  git commit -m "v$NEW: ${MSG:-nueva versión}"
  git tag "v$NEW"
  echo "Listo. Publica con:  git push && git push --tags"
fi
