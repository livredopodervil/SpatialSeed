# Decisões arquiteturais

## Aparência
`Object → appearanceId → materialId/shaderId → textureId`.

## Estado e renderer
Objetos lógicos são independentes de Mesh, InstancedMesh ou outro backend.

## Instanciamento
Lote por `kind + size + appearanceId`.

## Edição
Proxy `Object3D` invisível por objeto para pivô, gizmo e transformação.

## Repetição afim
`M(n+1) = ΔM · M(n)`.

## Experimentos
Cliente estável em `apps/web`; protótipos em `apps/experiments`.

## Distribuição
Python, Bash, Node, Go, PWA ou aplicativo são lançadores possíveis, não dependências semânticas do núcleo.
