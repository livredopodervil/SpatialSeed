# Multitoque, snap e medição — 0040b

O build `0040b` mantém a navegação disponível durante ferramentas de desenho,
seleção, criação e transformação.

## Propriedade dos ponteiros

| Ponteiros de toque | Autoridade | Efeito |
| --- | --- | --- |
| 1 | ferramenta ativa | desenhar, selecionar, posicionar ou transformar |
| 2 | viewer | deslocar e aproximar/afastar |
| 3 | viewer | orbitar o foco corrente, quando permitido |

Quando o segundo toque aparece, qualquer rascunho ainda não publicado é
descartado. Os eventos continuam até `OrbitControls`; nenhuma geometria,
seleção ou alteração de histórico é confirmada. Mouse e caneta conservam a
captura exclusiva já usada pelas ferramentas.

`ToolGestureNavigation` mantém os ponteiros ativos e uma pilha de proprietários.
Assim, HUD de seleção, desenho 2D, caminhos, colocação e medição podem coexistir
com a autoridade editorial sem instalar loops ou listeners por objeto.

## Snap comum

O contexto de edição guarda:

- ativação global;
- snap de vértice, aresta, face e grade;
- passo da grade;
- trava angular e passo em graus;
- eixos X, Y e Z permitidos no frame ativo.

`translationSnap` e `rotationSnapDeg` alimentam os gizmos 3D. A mesma
configuração é projetada no frame do plano por `constrainPlanarPoint`, usado
por formas 2D, desenho de caminhos, régua e transferidor.

## Régua e transferidor

A régua mede dois pontos e retorna distância e delta. O transferidor recebe
centro e dois raios e retorna o menor ângulo entre eles. Ambos:

- usam o plano de desenho, ou o plano de edição/viewer como fallback;
- mantêm um único `LineSegments` local;
- não consultam objetos passivos durante o gesto;
- não publicam comando de cena nem etapa de undo;
- desaparecem ao cancelar ou descartar o viewer.

O readout é local ao viewer. Cotas persistentes e referências transformadoras
continuam fora deste contrato.

## HUD e câmera

As dimensões do HUD aceitam qualquer inteiro positivo. A grade efetiva limita
células ao número de controles visíveis e, quando fixada, usa a capacidade do
viewport antes de recorrer à rolagem. O comando `viewer.camera.reset` restaura
posição, orientação, foco e projeção capturados pelo controlador ao iniciar o
viewer.

## Testes

Os contratos automatizados cobrem:

- rascunho 2D e seleção sem publicação após segundo toque;
- `pan/pinch` com dois ponteiros e órbita com três;
- restauração do estado anterior de `OrbitControls`;
- passos explícitos de grade/ângulo em 2D e 3D;
- dimensões do HUD acima de `12 × 8`;
- distância, ângulo e ausência de mutação documental;
- reset exato da câmera inicial.
