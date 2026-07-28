# Console espacial e repetição afim

A duplicação simples abre uma sequência. Enquanto ela estiver aberta, cada
transformação confirmada recompõe a matriz delta mundial
`Delta = M_final × inversa(M_inicial)`. Portanto, executar `move`, `rotate` e
`scale` antes de repetir preserva a transformação composta inteira.

`repeat` aplica a mesma matriz à próxima fronteira. `repeat count N` aplica
sucessivamente `Delta`, `Delta²`, ..., `Deltaᴺ`, cria todas as cópias em um
único comando do sandbox e seleciona somente a fronteira final.

## Comandos

```text
create box
create box x y z
position x y z
move dx dy dz
rotate xDeg yDeg zDeg
scale sx sy sz
duplicate
duplicate count N
duplicate count N move|rotate|scale|pivot|matrix ...
repeat
repeat count N
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

Uma nova duplicação substitui a sequência anterior. Em viewers coordenados, a
seleção das cópias e a disponibilidade de `repeat` aguardam o snapshot que
confirma a criação dos objetos.
