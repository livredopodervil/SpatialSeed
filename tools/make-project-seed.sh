#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
cd "$HOME/SpatialSeed-monorepo"

OUT="PROJECT_SEED.md"
TMP="$(mktemp)"

cat > "$TMP" <<'EOF'
# Spatial Seed — semente de continuidade

## Objetivo

Construir um navegador/editor espacial modular para Android/Termux e navegador, no qual regiões mantêm autoridade interna; sandboxes locais acumulam alterações; seleção e pivôs pertencem ao editor; renderizadores são projeções substituíveis.

## Ambiente local

- Android com Termux.
- Repositório: `~/SpatialSeed-monorepo`
- Cópia pública: `~/storage/shared/SpatialSeed-monorepo`
- Aplicação: `http://127.0.0.1:8082/apps/web/`
- Não presumir Node.js ou npm instalados.
- Evitar edição manual no telefone.
- Alterações devem ficar dentro do projeto, ser auditáveis por Git e não criar duplicidade involuntária.

## Invariantes arquitetônicas

1. A região é autoridade sobre seu estado interno.
2. O universo global não interpreta detalhes internos da região.
3. Undo/redo pertencem ao sandbox, nunca ao universo global.
4. Three.js não é estado autoritativo; é cache visual derivado.
5. Seleção, pivô, ferramentas e modos pertencem ao editor.
6. Editar o pivô não modifica objetos nem sandbox.
7. Transformações produzem comandos serializáveis.
8. Dependências ficam atrás de adaptadores substituíveis.
9. O sistema deve continuar executável quando módulos opcionais falham.
10. Cada atualização deve ser verificável por hashes e `git diff`.

## Comandos operacionais

```bash
cd ~/SpatialSeed-monorepo
bash tools/seedctl status
bash tools/seedctl sync
bash tools/seedctl verify
bash tools/seedctl serve
bash tools/seedctl seed
```

## Estrutura principal

```text
apps/web/
packages/core/
packages/editor-core/
packages/plugin-api/
packages/region-box/
packages/renderer-three/
packages/renderer-outline/
docs/
tools/
```

## Estado funcional esperado

- três caixas;
- seleção única e múltipla;
- seleção vazia explícita;
- pivôs mediana, limites, ativo e personalizado;
- editar pivô sem alterar objetos;
- mover, girar e escalar seleção;
- undo/redo no sandbox;
- revisão e confirmação de proposta;
- painel de diagnóstico com build e versões de API.

## Protocolo para próxima LLM

1. Ler este arquivo.
2. Executar `bash tools/seedctl status`.
3. Executar `bash tools/seedctl verify`.
4. Não modificar arquivos antes de verificar o estado Git.
5. Entregar updates como pacote ou patch auditável, nunca pedir grandes edições manuais.
6. Não presumir ferramentas ausentes.
7. Preservar sempre uma versão executável.
EOF

{
  echo
  echo "## Estado Git atual"
  echo
  echo '```text'
  git status --short
  echo '```'
  echo
  echo "## Commits recentes"
  echo
  echo '```text'
  git log --oneline -10
  echo '```'
  echo
  echo "## Arquivos principais e hashes"
  echo
  echo '```text'
  find apps packages docs tools -type f \
    ! -path '*/.git/*' \
    -print0 | sort -z | xargs -0 sha256sum
  echo '```'
} >> "$TMP"

mv "$TMP" "$OUT"
echo "Atualizado: $PROJECT/$OUT"
