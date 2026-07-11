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
