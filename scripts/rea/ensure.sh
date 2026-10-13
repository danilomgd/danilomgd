#!/usr/bin/env bash
# Garante o pacote npm rea-agents (REA: engenharia reversa via MCP) instalado globalmente na
# versao fixada, para que o servidor MCP suba rapido e sem baixar nada na hora da conexao.
#
# Idempotente: se o `rea` instalado ja esta na versao desejada, nao faz nada. Usado pelo hook de
# SessionStart (.claude/hooks/session-start.sh) e pelo wrapper do MCP (scripts/rea/mcp.sh).
#
# Variaveis opcionais:
#   REA_VERSION   versao do pacote rea-agents. Padrao: 6.4.0 (a mesma fixada no .mcp.json).
# Saida (stdout): o caminho absoluto do executavel `rea`. Logs vao para stderr.
set -euo pipefail

REA_VERSION="${REA_VERSION:-6.4.0}"

log() { printf '[rea] %s\n' "$*" >&2; }
die() { printf '[rea] ERRO: %s\n' "$*" >&2; exit 1; }

command -v npm >/dev/null 2>&1 || die "npm nao encontrado. REA exige Node.js 22.19+ (ou 24.11+)"

installed_version() {
  local bin="$1"
  [ -x "$bin" ] || return 1
  node -e 'process.stdout.write(require(process.argv[1]).version)' \
    "$(dirname "$(readlink -f "$bin")")/../package.json" 2>/dev/null || true
}

find_bin() {
  if command -v rea >/dev/null 2>&1; then command -v rea; return; fi
  local p
  p="$(npm prefix -g 2>/dev/null)/bin/rea"
  [ -x "$p" ] && printf '%s\n' "$p"
}

BIN="$(find_bin || true)"
if [ -n "$BIN" ] && [ "$(installed_version "$BIN")" = "$REA_VERSION" ]; then
  printf '%s\n' "$BIN"; exit 0
fi

# Evita duas instalacoes simultaneas (hook de sessao + wrapper do MCP ao mesmo tempo).
exec 9>"${TMPDIR:-/tmp}/.rea-ensure.lock"
flock 9
BIN="$(find_bin || true)"
if [ -n "$BIN" ] && [ "$(installed_version "$BIN")" = "$REA_VERSION" ]; then
  printf '%s\n' "$BIN"; exit 0
fi

log "instalando rea-agents@$REA_VERSION (npm install --global); pode levar alguns minutos"
npm install --global --no-fund --no-audit "rea-agents@$REA_VERSION" >&2

BIN="$(find_bin || true)"
[ -n "$BIN" ] || die "npm instalou, mas o executavel 'rea' nao foi encontrado em $(npm prefix -g)/bin"
log "pronto: $BIN ($("$BIN" --version 2>/dev/null | head -n1))"
printf '%s\n' "$BIN"
