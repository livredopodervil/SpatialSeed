#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

PROJECT="${SPATIALSEED_PROJECT:-$HOME/SpatialSeed-monorepo}"
TEMPLATE="$PROJECT/docs/PROJECT_SEED_TEMPLATE.md"
OUTPUT="$PROJECT/PROJECT_SEED.md"

cd "$PROJECT"
cp "$TEMPLATE" "$OUTPUT"
echo "Semente durável atualizada: $OUTPUT"
echo "Estado efêmero deve ser consultado com Git, build-info.json e runtime."
