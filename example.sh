#!/usr/bin/env bash
# example.sh — Run typerry examples with either the JS or Rust compiler
#
# Usage:
#   ./example.sh                  # default: js compiler, all examples
#   ./example.sh js               # js compiler, all examples
#   ./example.sh rs               # rust compiler (cargo), all examples
#   ./example.sh js wasm          # js compiler, wasm example only
#   ./example.sh rs bare          # rust compiler, bare example only
#   ./example.sh js html,wasm     # js compiler, html + wasm examples
#
# Rust mode requires `cargo` on PATH.  JS mode uses the native napi addon
# (build it first with `npm run build` or `npm run build:lib`).

set -euo pipefail

# ---- resolve mode ------------------------------------------------
MODE="${1:-js}"          # js | rs
shift 2>/dev/null || true
EXAMPLES="${1:-all}"     # wasm | html | bare | all (comma-separated)

# Normalise comma-separated list
IFS=',' read -ra NAMES <<< "$EXAMPLES"
if [ "$EXAMPLES" = "all" ]; then
  NAMES=(wasm html bare)
fi

# ---- pick compiler command ---------------------------------------
if [ "$MODE" = "rs" ]; then
  CMD="cargo run --release --"
  TAG="[rs/cargo]"
elif [ "$MODE" = "js" ]; then
  CMD="node index.js"
  TAG="[js/node]"
else
  echo "Unknown mode: $MODE  (use 'js' or 'rs')"
  exit 1
fi

# ---- shared helper ------------------------------------------------
run_example() {
  local name="$1"
  local input="examples/${name}/input.ts"
  local out="examples/${name}/output"
  local imports=""
  local flags=""

  case "$name" in
    wasm)
      imports='{filename(){return import.meta.url}}'
      ;;
    html)
      imports='{doc(){return document}}'
      flags="--html"
      ;;
    bare)
      flags="--bare"
      ;;
  esac

  echo ""
  echo "=== $TAG $name ==="
  echo "→ $CMD $input -o $out $flags ${imports:+-i $imports}"

  # shellcheck disable=SC2086
  $CMD "$input" -o "$out" $flags ${imports:+-i "$imports"}

  case "$name" in
    wasm)
      echo "→ run node examples/wasm/index.js"
      node examples/wasm/index.js 2>&1 || echo "(runtime boot may fail if FFI imports are missing — WASM binary is still valid)"
      ;;
    html)
      echo "→ open examples/html/output.html in a browser to see the result"
      ;;
    bare)
      echo "→ output: examples/bare/output.wasm"
      ;;
  esac
}

# ---- main ---------------------------------------------------------
echo "typerry examples  (mode=$MODE  targets=${NAMES[*]})"

for name in "${NAMES[@]}"; do
  case "$name" in
    wasm|html|bare) run_example "$name" ;;
    *) echo "Unknown example: $name  (use wasm, html, or bare)" ;;
  esac
done

echo ""
echo "Done."
