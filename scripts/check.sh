#!/usr/bin/env bash
# Revisiones antes de publicar:
#   - cada archivo .js, .css y de íconos está en la lista SHELL de sw.js
#   - la versión de js/version.js coincide con la de sw.js
#   - SCHEMA_VERSION tiene su migración en js/db.js
set -euo pipefail
cd "$(dirname "$0")/.."
fail=0

while IFS= read -r f; do
  if ! grep -q "'./$f'" sw.js; then echo "Falta en sw.js (SHELL): ./$f"; fail=1; fi
done < <(find js css icons -type f \( -name '*.js' -o -name '*.css' -o -name '*.png' -o -name '*.svg' \) | sort)

APP=$(perl -ne "print \$1 if /APP_VERSION = '([^']+)'/" js/version.js)
SW=$(perl -ne "print \$1 if /const VERSION = '([^']+)'/" sw.js)
if [[ "$APP" != "$SW" ]]; then echo "Versión distinta: version.js=$APP, sw.js=$SW"; fail=1; fi

SCHEMA=$(perl -ne 'print $1 if /SCHEMA_VERSION = (\d+)/' js/version.js)
if ! perl -0ne "exit(/MIGRATIONS = \{.*?^\s*$SCHEMA: /ms ? 0 : 1)" js/db.js; then
  echo "SCHEMA_VERSION=$SCHEMA no tiene migración en js/db.js"; fail=1
fi

if command -v node >/dev/null; then
  for f in $(find js -name '*.js') sw.js; do node --check "$f" 2>/dev/null || { echo "Error de sintaxis: $f"; node --check "$f"; fail=1; }; done
fi

if [[ $fail -ne 0 ]]; then echo "Revisión fallida."; exit 1; fi
echo "Revisión correcta (v$APP, esquema $SCHEMA)."
