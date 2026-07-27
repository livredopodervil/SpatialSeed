# Gizmo proporcional em tempo real — build 0034g

O build 0034g integra o campo de influência da edição procedural ao gizmo de transformação. O arrasto passa a usar uma fotografia imutável das posições no início da interação e recalcula a prévia a cada evento do `TransformControls`, sem acumular erros e sem criar entradas intermediárias no histórico.

Para cada vértice afetado, o campo fornece um peso `w`. Vértices selecionados usam `w = 1`; vértices conectados recebem o peso determinado pela distância, raio, métrica e falloff configurados. A métrica geodésica é o padrão, portanto a influência percorre as arestas da malha em vez de atravessar superfícies próximas no espaço.

Na translação, o deslocamento ponderado é `p' = p + w d`, em que `p` é a posição mundial inicial e `d` é o deslocamento do gizmo já projetado na restrição de eixo ou plano. Na rotação, o ângulo é multiplicado por `w`; na escala, cada fator é interpolado como `1 + w(s - 1)`. Pesos negativos do falloff elástico produzem resposta na direção oposta sem interpolação matricial degenerada.

O painel **Editar → Editar malha** contém a opção **Aplicar o falloff ao gizmo em tempo real**. Os controles de raio, métrica, eixo métrico, falloff, amortecimento, frequência, expressão personalizada e variáveis alimentam tanto a prévia do gizmo quanto os comandos afins. O botão **Aplicar deformação** continua executando expressões X/Y/Z independentes.

O campo de influência é calculado uma vez no começo de cada arrasto e reutilizado durante a prévia. Posições, marcadores e wireframe são atualizados em tempo real; normais e volumes delimitadores são recalculados apenas ao terminar o arrasto. Cada arrasto cria uma única entrada no undo interno da sessão.

Comandos equivalentes:

```text
mesh influence on
mesh influence set radius=5 metric=geodesic falloff=smooth axis=x
mesh influence set radius=8 metric=geodesic falloff=elastic damping=2.5 frequency=3
mesh influence off
```
