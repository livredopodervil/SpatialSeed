# Workspace e HUD unificados de edição — 0036b

O build `20260727-0036b` consolida seleção, transformação e entrada na edição de
malha numa única superfície de trabalho. A barra declarativa deixa de exigir os
menus separados **Transformar**, **Seleção** e **Editar**; esses estados passam a
ser controlados por um painel único e por um HUD local ao viewer.

## HUD permanente

O HUD contém os estados de alta frequência:

- nível: objeto, vértice, aresta ou face;
- ferramenta: navegar, selecionar, mover, girar ou escalar;
- referencial: mundo, objeto, viewer congelado ou plano travado;
- eixos X, Y e Z como checkboxes independentes;
- snap geral, automático, vértice, aresta, face e grade;
- influência proporcional;
- plane lock e point lock;
- undo/redo internos e aplicar/cancelar a sessão.

A posição, orientação, tamanho, opacidade e grupos visíveis são persistidos em
`localStorage["spatialseed.edit.hud.v1"]`. O HUD pode ficar flutuante ou fixado
na parte superior ou inferior da tela.

## Contexto unificado

`EditContextController` é estado efêmero do viewer. Ele não altera o documento
e não entra no histórico editorial. As interfaces chamam comandos públicos:

```text
edit.context.subject.set
edit.context.tool.set
edit.context.selection-operation.set
edit.context.frame.set
edit.context.axes.set
edit.context.snap.set
edit.context.proportional.set
edit.navigation.plane.toggle
edit.navigation.point.toggle
edit.navigation.locks.clear
```

O nível objeto e os modos de componente são exclusivos. Sair de uma sessão de
malha exige **Aplicar** ou **Cancelar**, evitando commit implícito.

## Eixos independentes

Os checkboxes são convertidos numa restrição ortogonal comum ao gizmo e às
operações afins:

```text
XYZ -> free
X   -> x
XY  -> xy
∅   -> none
```

`none` bloqueia completamente o movimento sem trocar de ferramenta.

## Referenciais de objeto

Além de mundo e local, transformações de objeto podem capturar a orientação
atual do viewer ou usar o frame do plano de navegação. O `TransformControls`
continua em espaço local, mas sua âncora recebe o quaternion do frame escolhido;
preview e commit seguem a mesma matriz delta já usada pelo runtime.

## Plane lock

Um plano é descrito por origem, normal e eixo X. O renderer ortonormaliza a base
e guarda também o quaternion correspondente. Fontes disponíveis no painel:

- viewer atual;
- face ativa;
- objeto ativo;
- planos mundiais XY, XZ e YZ.

Durante a navegação, o alvo do `OrbitControls` é projetado no plano. A mesma
correção é aplicada à câmera, preservando o vetor câmera-alvo. Assim, pan fica
restrito ao plano, enquanto órbita e dolly continuam disponíveis.

## Point lock

O point lock fixa o alvo orbital num ponto obtido do componente ativo, pivô da
seleção ou alvo atual do viewer. Tentativas de pan são anuladas pela translação
conjunta da câmera e do alvo de volta ao ponto travado. Se também houver plane
lock, o ponto é projetado nesse plano.

## Snap combinável

O snap de malha passa a aceitar um conjunto de alvos, e não somente um modo
exclusivo. Vértice e face, por exemplo, podem permanecer ativos enquanto aresta
fica desativada. O campo legado `mode` continua disponível para console e painel
anteriores; `modes` é a representação autoritativa da combinação.

## Escopo desta produção

Este marco implementa as fases de interface unificada e travas de navegação.
Referências genéricas de objetos para sweep/tubo, sanitização robusta e booleanos
continuam separados porque exigem novos contratos geométricos e, no caso dos
booleanos autoritativos, integração de kernel/WASM. Não foram criados botões que
simulem essas operações sem implementação de domínio.
