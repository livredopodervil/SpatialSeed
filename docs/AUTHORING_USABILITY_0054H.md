# SpatialSeed 0054h — consistência de planos, interação e ajuda de campos

## Objetivo

Esta etapa corrige integração de autoria sem alterar os contratos matemáticos da 0054g.
Ela estabelece uma prioridade única para gestos de criação e caminhos:

1. plano de desenho, quando definido;
2. plano de edição, quando definido;
3. frame do viewer como fallback implícito.

O frame de transformação (`world`, `local`, `viewer`, `custom-plane`) continua sendo
um conceito separado: ele orienta gizmos e transformações, não substitui um plano de
criação.

## Correções

- `ObjectPlacementController` usa o plano de desenho antes do plano de edição.
- `MeshPathGestureController` usa a mesma prioridade para extrusão por arrasto/traço.
- mudar a fonte do plano no HUD aplica o alvo imediatamente; o botão de definir
  permanece como ação explícita para recapturar seleção/face/objeto.
- o HUD ganhou um botão contextual de configuração da extrusão que leva diretamente
  ao configurador canônico de `mesh.extrude`.
- o canvas bloqueia o menu de contexto do navegador e declara `touch-action:none`;
  gestos de criação e caminho capturam também ponteiros touch.
- `FormFieldHints` fornece `title`/`aria-description` para campos estáticos e
  dinâmicos, complementando descrições específicas e parâmetros min/max/step.

## Invariantes

- nenhuma matemática de malha depende de DOM ou Three.js;
- plano de desenho e plano de edição continuam independentes;
- a ajuda de campos é uma camada de UI sem semântica de domínio;
- a captura de ponteiro só é assumida por uma ferramenta enquanto seu gesto está ativo.
