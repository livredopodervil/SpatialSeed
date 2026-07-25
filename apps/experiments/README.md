# Protótipos independentes

Esta pasta preserva superfícies experimentais anteriores ou externas ao
laboratório declarativo mantido em `apps/web/`.

- `root-region-prototype/` contém o protótipo que ocupava a raiz antes do portal
  do marco 0029a;
- `algebraic-structures/` contém sete HTMLs históricos de geração e edição.

O índice público e o manifesto canônico ficam em:

```text
apps/web/experiments/
apps/web/experiments/catalog.json
```

Adicionar ou remover um HTML nesta pasta exige atualizar o catálogo. Verifique o
contrato com:

```bash
python3 tools/audit_web_entrypoints.py
```

Uma entrada no catálogo não transforma um protótipo em parte do runtime
mantido. Código promovido deve continuar entrando por comandos, registros,
capabilities e testes do aplicativo.
