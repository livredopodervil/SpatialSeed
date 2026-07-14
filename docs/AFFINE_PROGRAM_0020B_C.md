# AffineProgram 0020b-c

O parser e o avaliador paramétrico foram extraídos de `AffineRepeat.js`
para um fragmento autocontido:

- `AffineProgram.js`: linguagem, AST, unidades, funções e contexto;
- `AffineRepeat.js`: composição matricial e geração das cópias.

Não há mudança no renderer, seleção, sandbox ou console.

## Unidades aceitas

- graus: `30d`, `30 deg`, `cosd(30)`;
- radianos: `pi/6r`, `pi/6 rad`, `cos(pi/6)`;
- voltas: `0.5turn`, `0.5 turn`.

`sin`, `cos` e `tan` recebem radianos. `sind`, `cosd` e `tand`
recebem graus.

## Resultado esperado

- `runtime test affine-repeat`: 10/10;
- `runtime test all`: 70/70.
