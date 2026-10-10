#!/bin/bash
# SessionStart hook: nas sessoes Claude Code na nuvem (Linux), compila o vectorcraft-cli a partir do
# repositorio oficial storytold/vectorcraft antes do MCP subir. Idempotente: a segunda execucao
# so confere a versao e sai.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
BIN="$(bash "$ROOT/scripts/vectorcraft/ensure-linux.sh")"

if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export VECTORCRAFT_CLI=\"$BIN\"" >> "$CLAUDE_ENV_FILE"
  echo "export PATH=\"$(dirname "$BIN"):\$PATH\"" >> "$CLAUDE_ENV_FILE"
fi
echo "vectorcraft-cli pronto em $BIN"
