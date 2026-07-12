# Console espacial e repetição afim

A primeira transformação confirmada depois de `duplicate` é registrada como uma matriz delta: `Delta = M_final × inversa(M_inicial)`.

`repeat` aplica essa mesma matriz às cópias seguintes. Isso permite repetir translação, rotação em torno do pivô, escala ou combinações dessas operações.

## Comandos

```text
create box
create box x y z
position x y z
move dx dy dz
rotate xDeg yDeg zDeg
scale sx sy sz
duplicate
repeat
delete
pivot median
pivot bounds
pivot active
pivot absolute x y z
pivot relative dx dy dz
```

`position` coloca o pivô da seleção numa posição mundial absoluta.

`pivot absolute` define diretamente a posição mundial do pivô personalizado.

`pivot relative` usa a origem do objeto ativo como centro e soma o deslocamento informado.
