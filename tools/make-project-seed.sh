#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT="${SPATIALSEED_PROJECT:-$(dirname -- "$SCRIPT_DIR")}"
TEMPLATE="$PROJECT/docs/PROJECT_SEED_TEMPLATE.md"
OUTPUT="$PROJECT/PROJECT_SEED.md"

cd "$PROJECT"
if [[ "${1:-}" == "--check" ]]; then
  cmp -- "$TEMPLATE" "$OUTPUT"
  exit
fi
[[ $# -eq 0 ]] || { echo 'Uso: bash tools/make-project-seed.sh [--check]' >&2; exit 2; }
cp "$TEMPLATE" "$OUTPUT"
echo "Semente durável atualizada: $OUTPUT"
echo "Estado efêmero deve ser consultado com Git, build-info.json e runtime."
