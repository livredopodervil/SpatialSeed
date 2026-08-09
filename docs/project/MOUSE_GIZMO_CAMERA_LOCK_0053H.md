# Exclusão mútua entre gizmo e câmera — 0053h

## Sintoma

Ao arrastar um objeto pelo `TransformControls` com o botão esquerdo do mouse,
o `OrbitControls` também girava a câmera. Em touch, o defeito ficava oculto
porque a navegação da ferramenta já desabilitava o gesto de um dedo.

## Causa

As ferramentas de edição adquirem `ToolGestureNavigation` para manter pan e
zoom com dois dedos e órbita com três dedos. O listener `dragging-changed`
tratava esse estado auxiliar como autorização para manter a órbita habilitada,
mesmo quando `TransformControls.dragging` era verdadeiro. Como os dois
controles escutam o mesmo canvas, o mouse alimentava ambos no mesmo gesto.

## Contrato corrigido

`EditorOrbitPolicy` torna a precedência explícita e independente do dispositivo:

1. arraste do gizmo ou escala por limites bloqueia a câmera;
2. ao terminar a transformação, a navegação touch adquirida pela ferramenta é
   restaurada;
3. fora de transformações, a política de seleção e navegação permanece igual.

O renderer usa a mesma função no evento de arraste e nas reconfigurações de
estado, evitando que uma atualização do editor reative a câmera no meio do
gesto.

## Gates

- runtime: caso específico de precedência do gizmo;
- standalone: mouse, touch, caneta, escala por limites e marcador de integração;
- arquitetura: o módulo é exportado pela interface pública de `renderer-three`.
