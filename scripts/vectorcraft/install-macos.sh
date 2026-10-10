#!/usr/bin/env bash
# Instala o vectorcraft-cli no macOS e registra o servidor MCP no Claude Code (escopo user).
#
# 1. Baixa o binario oficial universal (Apple Silicon + Intel) da release mais recente de
#    https://github.com/storytold/vectorcraft e confere o SHA-256 contra o SHA256SUMS.txt da release.
# 2. Se o download falhar (sem rede, asset ausente), clona o repositorio oficial e compila com
#    `cargo build --release -p vectorcraft-cli`.
# 3. Registra: claude mcp add --scope user vectorcraft -- <caminho absoluto>/vectorcraft-cli mcp
# 4. Confirma com: claude mcp list
#
# Uso:  bash scripts/vectorcraft/install-macos.sh
# Variaveis opcionais:
#   VECTORCRAFT_VERSION   tag a instalar (ex.: v0.8.0). Padrao: a release mais recente.
#   VECTORCRAFT_BIN_DIR   pasta de destino do binario. Padrao: ~/.local/bin
#   VECTORCRAFT_SRC_DIR   pasta do clone para o fallback por compilacao. Padrao: ~/.vectorcraft/src
#   VECTORCRAFT_FORCE_BUILD=1   pula o download e compila direto.
set -euo pipefail

REPO_URL="https://github.com/storytold/vectorcraft"
BIN_DIR="${VECTORCRAFT_BIN_DIR:-$HOME/.local/bin}"
SRC_DIR="${VECTORCRAFT_SRC_DIR:-$HOME/.vectorcraft/src}"
BIN="$BIN_DIR/vectorcraft-cli"

log() { printf '==> %s\n' "$*" >&2; }
die() { printf 'ERRO: %s\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || die "este script e para macOS. No Linux use scripts/vectorcraft/ensure-linux.sh"
command -v curl >/dev/null || die "curl nao encontrado"
command -v claude >/dev/null || die "o comando 'claude' (Claude Code) nao esta no PATH"

resolve_latest_tag() {
  # 1) tags do repositorio via git (funciona mesmo onde paginas HTML do GitHub sao bloqueadas)
  local tag
  if command -v git >/dev/null; then
    tag="$(git ls-remote --tags --refs "$REPO_URL" 'v*' 2>/dev/null | awk -F/ '{print $NF}' | sort -V | tail -n1)"
    if [ -n "$tag" ]; then printf '%s\n' "$tag"; return 0; fi
  fi
  # 2) a pagina /releases/latest redireciona para /releases/tag/vX.Y.Z
  local url
  url="$(curl -fsSL -o /dev/null -w '%{url_effective}' "$REPO_URL/releases/latest")" || return 1
  case "$url" in
    */releases/tag/v*) printf '%s\n' "${url##*/}" ;;
    *) return 1 ;;
  esac
}

install_from_release() {
  local tag ver asset base tmp
  tag="${VECTORCRAFT_VERSION:-$(resolve_latest_tag)}" || { log "nao foi possivel descobrir a release mais recente"; return 1; }
  ver="${tag#v}"
  asset="vectorcraft-cli-$ver-macos-universal.zip"
  base="$REPO_URL/releases/download/$tag"
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN

  log "baixando $asset da release $tag"
  curl -fsSL -o "$tmp/$asset" "$base/$asset" || { log "download do asset falhou"; return 1; }
  curl -fsSL -o "$tmp/SHA256SUMS.txt" "$base/SHA256SUMS.txt" || { log "download do SHA256SUMS.txt falhou"; return 1; }

  log "conferindo SHA-256"
  ( cd "$tmp" && grep -F " $asset" SHA256SUMS.txt | shasum -a 256 -c - ) || { log "checksum nao confere"; return 1; }

  log "extraindo"
  ditto -x -k "$tmp/$asset" "$tmp/unz"
  local found
  found="$(find "$tmp/unz" -type f -name vectorcraft-cli | head -n1)"
  [ -n "$found" ] || { log "vectorcraft-cli nao encontrado dentro do zip"; return 1; }

  mkdir -p "$BIN_DIR"
  install -m 0755 "$found" "$BIN"
  xattr -d com.apple.quarantine "$BIN" 2>/dev/null || true
  log "binario oficial instalado em $BIN"
}

install_from_source() {
  if ! command -v cargo >/dev/null; then
    log "cargo nao encontrado; instalando a toolchain Rust (rustup, perfil minimal)"
    curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal --no-modify-path
    # shellcheck disable=SC1091
    . "$HOME/.cargo/env"
  fi
  command -v git >/dev/null || die "git nao encontrado (instale o Xcode Command Line Tools: xcode-select --install)"

  local tag
  tag="${VECTORCRAFT_VERSION:-$(resolve_latest_tag || true)}"
  if [ -d "$SRC_DIR/.git" ]; then
    log "atualizando clone em $SRC_DIR"
    git -C "$SRC_DIR" fetch --tags --depth 1 origin ${tag:+"refs/tags/$tag:refs/tags/$tag"} || git -C "$SRC_DIR" fetch --tags
  else
    log "clonando $REPO_URL em $SRC_DIR"
    mkdir -p "$(dirname "$SRC_DIR")"
    git clone --depth 1 ${tag:+--branch "$tag"} "$REPO_URL" "$SRC_DIR"
  fi
  if [ -n "$tag" ]; then git -C "$SRC_DIR" checkout -q "$tag"; fi

  log "compilando: cargo build --release -p vectorcraft-cli (pode levar varios minutos)"
  ( cd "$SRC_DIR" && cargo build --release --locked -p vectorcraft-cli )
  mkdir -p "$BIN_DIR"
  install -m 0755 "$SRC_DIR/target/release/vectorcraft-cli" "$BIN"
  log "binario compilado instalado em $BIN"
}

if [ "${VECTORCRAFT_FORCE_BUILD:-0}" = "1" ] || ! install_from_release; then
  log "usando fallback: compilar a partir do codigo-fonte oficial"
  install_from_source
fi

log "versao instalada: $("$BIN" --version)"

log "registrando no Claude Code (escopo user)"
claude mcp remove --scope user vectorcraft >/dev/null 2>&1 || true
claude mcp add --scope user vectorcraft -- "$BIN" mcp

log "verificando"
claude mcp list
