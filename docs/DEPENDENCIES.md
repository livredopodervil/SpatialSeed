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

## Math.js 11.11.0

Restrita aos sete protótipos históricos em
`apps/experiments/algebraic-structures/`. O aplicativo mantido não depende de
Math.js: suas expressões continuam usando a linguagem segura e os contratos
próprios do SpatialSeed.

Os arquivos executáveis e de licença estão em `vendor/mathjs-11.11.0/`. A
origem é o pacote npm oficial `mathjs@11.11.0`; o tarball usado na
vendorização possui SHA-256
`24bbf970983536bc1460fee9236d91987771e446efcc622af09bd45a071ec44d`.
O bundle `math.js` possui SHA-256
`aaccf701adf44cdddf2161d06132471ca9668dffd355aefd52c3c54d74bfd4ee`.

## Dependências dos protótipos históricos

O aplicativo mantido e os HTMLs independentes preservados em
`apps/experiments/algebraic-structures/` usam somente dependências locais. O
catálogo distingue recursos do PWA de recursos locais fora do escopo do
service worker.

O contrato estático é verificado sem fazer requisições externas:

```bash
python3 tools/audit_web_entrypoints.py
```

A auditoria falha se um HTML histórico não estiver catalogado, se uma
dependência observada não estiver declarada, se um caminho local não existir ou
se uma referência depender da raiz do domínio. O modo abaixo rejeita qualquer
nova dependência externa:

```bash
python3 tools/audit_web_entrypoints.py --strict-offline
```
