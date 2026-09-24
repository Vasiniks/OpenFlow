#!/usr/bin/env bash
# OpenFlow bootstrap for macOS / Linux.
#   curl -fsSL https://raw.githubusercontent.com/Vasiniks/OpenFlow/main/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/Vasiniks/OpenFlow/main/install.sh | bash -s -- --only opencode
# Ensures git, Node.js 20+ and uv, clones/updates OpenFlow into ~/.openflow, adds an `openflow` command, runs install.
set -euo pipefail
REPO="${OPENFLOW_REPO:-https://github.com/Vasiniks/OpenFlow.git}"
DIR="${OPENFLOW_HOME:-$HOME/.openflow}"
have() { command -v "$1" >/dev/null 2>&1; }
say() { printf '\033[1m== %s\033[0m\n' "$1"; }

say "OpenFlow bootstrap"
if ! have git; then
  if [ "$(uname)" = Darwin ]; then xcode-select --install 2>/dev/null || true; echo "Finish installing the Xcode Command Line Tools, then re-run."; exit 1; fi
  echo "Please install git, then re-run."; exit 1
fi
if ! have node || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  if have brew; then brew install node
  else echo "Please install Node.js 20+ (https://nodejs.org), then re-run."; exit 1; fi
fi
if ! have uv; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi

if [ -d "$DIR/.git" ]; then
  git -C "$DIR" pull --ff-only -q
elif [ -d "$DIR" ]; then   # an earlier install left caches/backups here: adopt the folder instead of cloning into it
  git -C "$DIR" init -q && git -C "$DIR" remote add origin "$REPO" && git -C "$DIR" fetch -q --depth 1 origin main \
    && git -C "$DIR" checkout -q -f -B main FETCH_HEAD && git -C "$DIR" branch -q -u origin/main
else
  git clone -q --depth 1 "$REPO" "$DIR"
fi

mkdir -p "$HOME/.local/bin"
printf '#!/bin/sh\nexec node "%s/openflow.mjs" "$@"\n' "$DIR" > "$HOME/.local/bin/openflow"
chmod +x "$HOME/.local/bin/openflow"
case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) echo "Tip: add ~/.local/bin to your PATH to use the \`openflow\` command." ;; esac

exec node "$DIR/openflow.mjs" install "$@"
