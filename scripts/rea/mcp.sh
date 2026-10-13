#!/usr/bin/env bash
# Wrapper usado pelo .mcp.json do projeto: inicia o servidor MCP do REA (rea-agents) em stdio.
# Nunca escreve em stdout antes do exec, pois stdout e o canal do protocolo.
#
# Ordem de busca:
#   1. `rea` ja instalado na versao fixada (ensure.sh instala no Linux se faltar)
#   2. `rea` no PATH (macOS/Windows: instalado por `npm install --global rea-agents`)
#   3. Fallback: `npx -y rea-agents@<versao> mcp` (mesma forma que o `rea setup` registra)
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export REA_VERSION="${REA_VERSION:-6.4.0}"

BIN=""
if [ "$(uname -s)" = "Linux" ]; then
  BIN="$(bash "$HERE/ensure.sh" 2>/dev/null || true)"
elif command -v rea >/dev/null 2>&1; then
  BIN="$(command -v rea)"
fi

if [ -n "$BIN" ] && [ -x "$BIN" ]; then
  exec "$BIN" mcp "$@"
fi

exec npx -y "rea-agents@$REA_VERSION" mcp "$@"
