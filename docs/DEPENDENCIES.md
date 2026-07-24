# Dependências

## Three.js 0.185.0

Restrita ao pacote `renderer-three`. Fornece WebGL, raycasting, `OrbitControls` e `TransformControls`. `TransformControls` oferece modos `translate`, `rotate` e `scale`, espaços local/mundo e snapping. A cena Three.js é cache derivado, não estado autoritativo.

Substituição: criar outro renderer que aceite snapshots regionais e emita comandos.

## npm workspaces

Apenas organização futura. A execução atual usa módulos ES por caminhos relativos e não exige Node/npm. Workspaces permitem administrar múltiplos pacotes locais a partir de uma raiz única.

## Dependências adiadas

- Immer: structural sharing e patches;
- XState: atores e protocolos complexos;
- Ajv: validação de schemas externos.

Nenhuma é necessária para abrir esta versão.

## Dependências dos protótipos históricos

O aplicativo mantido usa dependências locais em `vendor/`. Os HTMLs
independentes preservados em `apps/experiments/algebraic-structures/`, porém,
ainda carregam Math.js 11.11.0 por CDN. Essa dívida é declarada por entrada em
`apps/web/experiments/catalog.json`; por isso o catálogo pode distinguir
recursos do PWA, recursos locais fora do cache e protótipos que exigem rede.

O contrato estático é verificado sem fazer requisições externas:

```bash
python3 tools/audit_web_entrypoints.py
```

A auditoria falha se um HTML histórico não estiver catalogado, se uma
dependência observada não estiver declarada, se um caminho local não existir ou
se uma referência depender da raiz do domínio. O modo abaixo permanecerá
vermelho até a vendorização planejada para o 0029b:

```bash
python3 tools/audit_web_entrypoints.py --strict-offline
```
