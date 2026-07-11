# Selection como objeto do editor

A seleção não pertence à região nem aos objetos.

Ela pertence ao estado do editor e contém referências tipadas:

```js
{
  kind: "object",
  regionId: "region-main",
  objectId: "box-1"
}
```

O renderer recebe uma seleção e cria um `transformAnchor` temporário.

O `transformAnchor`:

- não é persistido;
- não integra o estado regional;
- não altera propriedades inerentes dos objetos;
- representa apenas o contexto atual da ferramenta.

## Transformação de grupo

No início do arrasto, o renderer registra:

- matriz inicial do pivô;
- matriz mundial inicial de cada objeto selecionado.

Durante o arrasto calcula:

```text
delta = currentPivot × inverse(initialPivot)
```

Depois:

```text
newObjectMatrix = delta × initialObjectMatrix
```

No final, o renderer emite um comando serializável:

```js
{
  type: "selection.transform",
  selection: selectionSnapshot,
  transforms: [...]
}
```

O reducer regional decide como interpretar a operação.

## Limitações atuais

- pivô apenas pela média das posições;
- política `group`;
- seleção apenas de objetos inteiros;
- sem seleção retangular ou laço;
- sem pivô pelo cursor ou elemento ativo;
- sem transformação individual por origem.
