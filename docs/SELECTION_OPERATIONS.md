# Operações sobre seleção

`duplicate` cria cópias completas da seleção como uma única operação do
sandbox. `duplicate count N` cria `N` cópias de cada raiz selecionada. Grupos
levam toda a subárvore, mas somente as raízes duplicadas entram na seleção.

A duplicação simples abre uma sequência de transformação. Até a primeira
repetição, o sistema mantém as matrizes mundiais iniciais das cópias e recompõe
`Delta = M_final × inversa(M_inicial)` após cada transformação confirmada. Isso
preserva numa única matriz translação, rotação, escala e pivô.

`repeat` cria a próxima fronteira aplicando `M(n+1) = Delta × M(n)`.
`repeat count N` cria `N` fronteiras sucessivas numa única transação e deixa
selecionada apenas a última. A matriz `Delta` permanece inalterada para
repetições seguintes.

`delete` remove a seleção inteira em uma operação atômica e limpa a seleção.

Duplicar, repetir e excluir entram no undo/redo do sandbox.

Numa réplica coordenada, IDs recém-gerados não são selecionados antes de
aparecerem no snapshot confirmado. Rejeição da intenção restaura o histórico de
repetição anterior.
