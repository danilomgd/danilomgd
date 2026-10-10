#!/usr/bin/env bash
# Garante o vectorcraft-cli no Linux (sessoes Claude Code na nuvem), compilando a partir do
# repositorio oficial https://github.com/storytold/vectorcraft com Rust.
#
# Idempotente: se o binario ja existe na versao desejada, nao faz nada. Usado pelo hook de
# SessionStart (.claude/hooks/session-start.sh) e pelo wrapper do MCP (scripts/vectorcraft/mcp.sh).
#
# Variaveis opcionais:
#   VECTORCRAFT_VERSION   tag a compilar (ex.: v0.8.0). Padrao: a tag v* mais recente do repositorio.
#   VECTORCRAFT_HOME      raiz de instalacao. Padrao: ~/.vectorcraft  (bin/ e src/ dentro dela)
# Saida (stdout): o caminho absoluto do binario pronto. Logs vao para stderr.
set -euo pipefail

REPO_URL="https://github.com/storytold/vectorcraft"
VC_HOME="${VECTORCRAFT_HOME:-$HOME/.vectorcraft}"
SRC_DIR="$VC_HOME/src"
BIN_DIR="$VC_HOME/bin"
BIN="$BIN_DIR/vectorcraft-cli"

log() { printf '[vectorcraft] %s\n' "$*" >&2; }
die() { printf '[vectorcraft] ERRO: %s\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = "Linux" ] || die "este script e para Linux. No macOS use scripts/vectorcraft/install-macos.sh"

resolve_tag() {
  if [ -n "${VECTORCRAFT_VERSION:-}" ]; then printf '%s\n' "$VECTORCRAFT_VERSION"; return; fi
  git ls-remote --tags --refs "$REPO_URL" 'v*' 2>/dev/null | awk -F/ '{print $NF}' | sort -V | tail -n1
}

TAG="$(resolve_tag)"
[ -n "$TAG" ] || die "nao foi possivel resolver a tag da release (sem rede?). Defina VECTORCRAFT_VERSION=vX.Y.Z"
WANT="${TAG#v}"

if [ -x "$BIN" ] && [ -f "$BIN_DIR/VERSION" ] && [ "$(cat "$BIN_DIR/VERSION")" = "$TAG" ]; then
  printf '%s\n' "$BIN"; exit 0
fi

# Evita duas compilacoes simultaneas (hook de sessao + wrapper do MCP ao mesmo tempo).
mkdir -p "$VC_HOME"
exec 9>"$VC_HOME/.lock"
flock 9
if [ -x "$BIN" ] && [ -f "$BIN_DIR/VERSION" ] && [ "$(cat "$BIN_DIR/VERSION")" = "$TAG" ]; then
  printf '%s\n' "$BIN"; exit 0
fi

if ! command -v cargo >/dev/null 2>&1; then
  if [ -f "$HOME/.cargo/env" ]; then
    # shellcheck disable=SC1091
    . "$HOME/.cargo/env"
  else
    log "cargo nao encontrado; instalando a toolchain Rust (rustup, perfil minimal)"
    command -v curl >/dev/null || die "curl nao encontrado"
    curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal --no-modify-path
    # shellcheck disable=SC1091
    . "$HOME/.cargo/env"
  fi
fi
command -v git >/dev/null || die "git nao encontrado"

if [ -d "$SRC_DIR/.git" ]; then
  log "atualizando clone para $TAG"
  git -C "$SRC_DIR" fetch --depth 1 origin "refs/tags/$TAG:refs/tags/$TAG"
else
  log "clonando $REPO_URL ($TAG) em $SRC_DIR"
  git clone --depth 1 --branch "$TAG" "$REPO_URL" "$SRC_DIR"
fi
git -C "$SRC_DIR" checkout -q "$TAG"

log "compilando vectorcraft-cli $WANT (cargo build --release -p vectorcraft-cli); pode levar varios minutos"
( cd "$SRC_DIR" && cargo build --release --locked -p vectorcraft-cli ) >&2

mkdir -p "$BIN_DIR"
install -m 0755 "$SRC_DIR/target/release/vectorcraft-cli" "$BIN"
printf '%s\n' "$TAG" > "$BIN_DIR/VERSION"
log "pronto: $BIN ($("$BIN" --version))"
printf '%s\n' "$BIN"
