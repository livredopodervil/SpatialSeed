# Fluxo seguro

Antes:
```bash
git status --short
git log -1 --oneline
git tag --points-at HEAD
```

Cada pacote deve informar base, hashes, arquivos, backup, aplicação, testes, critérios de sucesso, rollback e resumo.

Depois:
```bash
git diff --check
git status --short
bash tools/seedctl test
```

Só fazer commit após testar inicialização, seleção, highlight, picking, transformações, exclusão, undo/redo e persistência.
