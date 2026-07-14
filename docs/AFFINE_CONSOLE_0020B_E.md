# Console paramétrico 0020b-e

Integra o console ao AffineProgram sem alterar o parser matemático.

Exemplos:

```text
duplicate count 24 move "3*cos(i*pi/12)" "i*0.2" "3*sin(i*pi/12)"
duplicate count 18 rotate 0 "i*pi/18 rad" 0
duplicate count 20 scale "1+0.02*i" 1 1
```

Expressões com espaços devem permanecer entre aspas.

O caminho puramente numérico continua usando `composeAffineStep()` e
`affineCopies()`. O caminho paramétrico usa `affineProgramCopies()`.

Nesta etapa, `repeat` continua disponível para transformações constantes.
Para programas paramétricos, o retorno informa `repeatSupported: false`,
porque continuar corretamente a sequência exige preservar o índice e o
programa canônico, assunto de uma etapa posterior.
