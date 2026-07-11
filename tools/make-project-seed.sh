#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

PROJECT="$HOME/SpatialSeed-monorepo"
TEMPLATE="$PROJECT/docs/PROJECT_SEED_TEMPLATE.md"
OUTPUT="$PROJECT/PROJECT_SEED.md"
TMP="$(mktemp)"

cd "$PROJECT"

cat "$TEMPLATE" > "$TMP"

{
  echo
  echo "## Estado Git"
  echo '```text'
  git status --short
  echo '```'

  echo
  echo "## Commits recentes"
  echo '```text'
  git log --oneline -12
  echo '```'

  echo
  echo "## Hashes"
  echo '```text'
  find apps packages docs tools -type f -print0 |
    sort -z |
    xargs -0 sha256sum
  echo '```'
} >> "$TMP"

mv "$TMP" "$OUTPUT"
echo "Semente atualizada: $OUTPUT"
