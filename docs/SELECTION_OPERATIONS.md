# Operações sobre seleção

`duplicate` cria cópias completas da seleção como uma única operação do sandbox. As cópias tornam-se a seleção ativa.

O primeiro deslocamento confirmado registra `delta = pivô final − pivô inicial`. Nesta versão, o pivô operacional é a média das posições dos objetos.

`repeat` duplica a seleção atual e aplica o mesmo vetor: `P(n+1) = P(n) + delta`.

`delete` remove a seleção inteira em uma operação atômica e limpa a seleção.

Duplicar, repetir e excluir entram no undo/redo do sandbox.
