# Teste interativo 0020a-b1

1. Use uma cena nova e selecione uma caixa.
2. Execute `pivot median`.
3. Execute:
   `duplicate count 12 move 3 0 0 rotate 0 15 0 pivot median`
4. Confirme a espiral e o campo `pivot` no retorno.
5. Repita com `pivot active`.
6. Repita com `pivot absolute 0 0 0`.
7. Repita com `pivot relative 1 1 0`.
8. Execute um comando sem cláusula `pivot` e confira o pivô resolvido.
9. Teste `repeat`, undo e redo.
10. Execute:
    `runtime test affine-pivot`
    `runtime test affine-repeat`
    `runtime test all`
    `runtime resources`
