#!/usr/bin/env bash
# Wrapper do Chromium para a skill motionmaxxing nas sessoes Claude Code na nuvem.
# O container roda como root e o Chromium se recusa a abrir sem --no-sandbox.
# A skill le CHROME_PATH e nao aceita flags extras, entao CHROME_PATH aponta para este arquivo.
# Fora da nuvem (Mac/Windows) este wrapper nao e usado: a skill acha o Google Chrome sozinha.
set -euo pipefail
for c in "${MOTIONMAXXING_CHROME:-}" /opt/pw-browsers/chromium /usr/bin/google-chrome /usr/bin/chromium /usr/bin/chromium-browser; do
  if [ -n "$c" ] && [ -x "$c" ]; then exec "$c" --no-sandbox --disable-gpu "$@"; fi
done
echo "chrome-nosandbox.sh: nenhum Chromium encontrado (defina MOTIONMAXXING_CHROME)" >&2
exit 1
