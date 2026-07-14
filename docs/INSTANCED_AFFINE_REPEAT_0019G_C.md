# Renderer instanciado e repetição afim — 0019g-c

Esta atualização reúne duas mudanças atômicas:

1. desenho por `THREE.InstancedMesh`, agrupado por `kind + size + appearanceId`;
2. `duplicate count N` com transformação afim cumulativa e `repeat` baseado em `deltaMatrix` explícita.

## Exemplos

```text
duplicate count 100 move 2 0 0
duplicate count 36 rotate 0 10 0
duplicate count 40 pivot 0 0 0 rotate 0 0 5 scale 1.01 1.01 1.01
repeat
```

A duplicação afim seleciona somente a fronteira final de cada fonte. Assim,
`repeat` continua a sequência sem multiplicar novamente todas as cópias já
criadas.

## Renderer

Objetos lógicos são representados por proxies `Object3D` invisíveis para pivô,
gizmo e cálculo espacial. O desenho e o picking ficam nos lotes instanciados.
A seleção é realçada por `instanceColor`, sem clonar materiais.
