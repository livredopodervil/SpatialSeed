# 0053d — Transform Hierarchy Kernel

## Escopo

Este incremento introduz uma semântica única de transformação para objetos,
grupos e futuros ossos. A transformação autoritativa de um nó é sempre local ao
pai; a transformação mundial é derivada pela composição da cadeia hierárquica.

Para um nó `n`, vale o invariante:

`world(n) = world(parent(n)) * local(n)`.

Mover o pai não reescreve o `local` dos filhos. Reparenting, group e ungroup
preservam a transformação mundial calculando o novo local no frame do novo pai.

## Anchor e pivot

Anchor é o ponto estrutural local do nó. Pivot é o ponto operacional para
rotação/escala. O pivot explícito do nó prevalece; na ausência dele, o pivot
herda a anchor. Em seleção individual, o pivot efetivo é sempre o pivot do
próprio alvo, e não a média arbitrária de posições da cena.

## Preview de grupos

O renderer mantém duas categorias durante um gesto:

- raiz lógica selecionada, usada no commit;
- folhas/proxies renderizáveis, usadas no preview visual.

Antes deste incremento somente as folhas recebiam o delta. O commit lia a raiz
inalterada e perdia o movimento do grupo. Agora raiz e projeção visual recebem
o mesmo delta derivado; a raiz continua sendo a única transformação semântica
que precisa ser persistida.

## TransformOverlay

`TransformOverlay` é a primeira interface explícita para transformações
transitórias. Ele não participa de save ou histórico e prepara a migração futura
de preview interativo e animações para o mesmo modelo de camadas.

## Complexidade alvo

- mover raiz/grupo semanticamente: O(1);
- preview semântico de grupo: O(1);
- resolver world transform cold: O(H), onde H é a profundidade;
- world transform cacheado: O(1);
- group de K raízes: O(KH) cold, O(K) com world cache;
- ungroup de K filhos diretos: O(KH) cold, O(K) com cache;
- memória de transform de uma instância: O(1);
- geometria clonada por transform/group/ungroup: 0 bytes.

A expansão renderizável dos descendentes continua sendo custo derivado do
RenderGraph e não deve contaminar a complexidade semântica do editor.
