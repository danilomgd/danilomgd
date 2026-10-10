#!/usr/bin/env bash
# Wrapper usado pelo .mcp.json do projeto: localiza (ou prepara) o vectorcraft-cli e inicia o
# servidor MCP em stdio. Nunca escreve em stdout antes do exec, pois stdout e o canal do protocolo.
#
# Ordem de busca do binario:
#   1. $VECTORCRAFT_CLI, se definido
#   2. vectorcraft-cli no PATH
#   3. ~/.local/bin/vectorcraft-cli      (instalado por install-macos.sh)
#   4. ~/.vectorcraft/bin/vectorcraft-cli (compilado por ensure-linux.sh)
#   5. Linux: compila agora via ensure-linux.sh
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

find_bin() {
  if [ -n "${VECTORCRAFT_CLI:-}" ] && [ -x "$VECTORCRAFT_CLI" ]; then printf '%s\n' "$VECTORCRAFT_CLI"; return; fi
  if command -v vectorcraft-cli >/dev/null 2>&1; then command -v vectorcraft-cli; return; fi
  for c in "$HOME/.local/bin/vectorcraft-cli" "${VECTORCRAFT_HOME:-$HOME/.vectorcraft}/bin/vectorcraft-cli"; do
    if [ -x "$c" ]; then printf '%s\n' "$c"; return; fi
  done
  return 1
}

BIN="$(find_bin || true)"
if [ -z "$BIN" ]; then
  case "$(uname -s)" in
    Linux)  BIN="$(bash "$HERE/ensure-linux.sh")" ;;
    Darwin) printf '[vectorcraft] vectorcraft-cli nao encontrado. Rode: bash %s/install-macos.sh\n' "$HERE" >&2; exit 1 ;;
    *)      printf '[vectorcraft] sistema nao suportado por este wrapper\n' >&2; exit 1 ;;
  esac
fi

exec "$BIN" mcp "$@"
