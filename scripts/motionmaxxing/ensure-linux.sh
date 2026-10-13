#!/usr/bin/env bash
# ensure-linux.sh - garante a skill motionmaxxing (https://github.com/Tejashmakwana/motionmaxxing)
# instalada em ~/.claude/skills/motionmaxxing nas sessoes Claude Code na nuvem.
# O container e recriado a cada sessao, entao a instalacao "global" some; este script a refaz.
# Idempotente: se a pasta ja existe, so atualiza (git pull rapido) e sai.
# Imprime no stdout o caminho do wrapper do Chromium a ser usado em CHROME_PATH.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TARGET="${MOTIONMAXXING_DIR:-$HOME/.claude/skills/motionmaxxing}"
REPO_URL="https://github.com/Tejashmakwana/motionmaxxing"
WRAPPER="$ROOT/scripts/motionmaxxing/chrome-nosandbox.sh"

if [ -d "$TARGET/.git" ]; then
  (cd "$TARGET" && git pull -q --ff-only 2>/dev/null) || echo "motionmaxxing: ja instalada, sem atualizar (offline?)" >&2
elif [ -e "$TARGET" ]; then
  echo "motionmaxxing: $TARGET existe e nao e um clone git; mantendo como esta" >&2
else
  mkdir -p "$(dirname "$TARGET")"
  git clone -q --depth 1 "$REPO_URL" "$TARGET"
  echo "motionmaxxing: clonada em $TARGET" >&2
fi

# Requisitos (node 22+, python3, ffmpeg, chrome). Nao instala nada, so reporta.
CHROME_PATH="$WRAPPER" bash "$TARGET/install.sh" >&2 || true
echo "$WRAPPER"
