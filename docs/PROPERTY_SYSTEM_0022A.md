# Sistema de propriedades 0022a

## Objetivo

O recorte 0022a estabelece uma única semântica para propriedades editáveis. Painel, console, automações e futuras APIs de rede devem consultar o mesmo registro e emitir os mesmos comandos; nenhuma dessas superfícies é dona da mutação.

Este recorte cobre nome, aparência, textura e estado por instância. A interface visual e a gramática textual serão ligadas a esse contrato no recorte 0022b.

O recorte 0022b foi posteriormente implementado e está descrito em `PROPERTY_SURFACES_0022B.md`.

## Componentes

- `PropertyRegistry`: fonte autoritativa de metadados, validação, normalização, leitura e aplicabilidade.
- `SelectionPropertyService`: resolve a seleção para IDs explícitos, calcula os patches por objeto e despacha uma única transação.
- `AppearanceRuntime`: cria aparências imutáveis e endereçadas por conteúdo. Resultados iguais reutilizam o mesmo `appearanceId`.
- `boxRegionReducer`: aplica `selection.properties.set` atomicamente e produz uma alteração incremental por objeto.

## Propriedades iniciais

| ID | Tipo | Lote | Nulo | Escopo |
| --- | --- | --- | --- | --- |
| `object.name` | texto | não | não | objeto |
| `appearance.color` | cor `#rgb` ou `#rrggbb` | sim | não | aparência |
| `appearance.opacity` | número de 0 a 1 | sim | não | aparência |
| `appearance.transparent` | booleano | sim | não | aparência |
| `texture.src` | URI | sim | sim | aparência |
| `texture.repeat` | vetor 2D | sim | não | aparência |
| `texture.offset` | vetor 2D | sim | não | aparência |
| `texture.rotationDeg` | número | sim | não | aparência |
| `texture.wrap` | `repeat`, `clamp` ou `mirror` | sim | não | aparência |
| `instance.color` | cor `#rgb` ou `#rrggbb` | sim | sim | instância |

## Fronteira pública do runtime

Consultas:

```js
runtime.query("properties.describe")
runtime.query("selection.properties.inspect")
```

Comandos:

```js
runtime.execute("selection.properties.set", {
  patch: {
    "appearance.color": "#25a7ff",
    "appearance.opacity": 0.8,
    "appearance.transparent": true
  }
})

runtime.execute("selection.properties.set", {
  patch: {
    "texture.src": "https://example.org/grid.png",
    "texture.repeat": [4, 2],
    "texture.offset": [0.25, 0],
    "texture.rotationDeg": 15,
    "texture.wrap": "mirror"
  }
})

runtime.execute("selection.properties.unset", {
  properties: ["texture.src", "instance.color"]
})
```

O comando persistido não guarda a frase da interface nem depende da seleção futura. Ele contém `schemaVersion`, `targetIds`, `propertyPatch` normalizado e um patch resolvido para cada alvo.

```js
{
  type: "selection.properties.set",
  schemaVersion: 1,
  targetIds: ["box-1", "box-2"],
  propertyPatch: {
    "appearance.color": "#00aaff"
  },
  updates: [
    { id: "box-1", patch: { appearanceId: "appearance:…" } },
    { id: "box-2", patch: { appearanceId: "appearance:…" } }
  ]
}
```

## Inspeção de múltiplos objetos

Cada propriedade retorna um estado independente:

- `uniform`: todos os alvos têm o mesmo valor;
- `mixed`: há valores diferentes;
- `unsupported`: a propriedade não se aplica a todos os alvos.

O campo `editable` informa se a propriedade pode ser alterada naquele conjunto. Por exemplo, `object.name` é visível em uma seleção múltipla, mas não editável em lote.

## Invariantes

1. A seleção é resolvida antes do despacho; selecionar não altera o mundo.
2. Uma edição de vários campos em vários objetos ocupa uma única posição no histórico.
3. Toda entrada é normalizada antes da primeira mutação. Uma entrada inválida não produz estado parcial.
4. Uma alteração de aparência preserva os campos não mencionados.
5. A cor por instância permanece em `instanceState.color`; ela não altera a identidade da geometria nem a chave do lote.
6. Aparências semanticamente iguais convergem para o mesmo ID de conteúdo.

## Limite conhecido do recorte

O grafo de aparências já deduplica recursos, mas a reconciliação de contadores de referência ao desfazer, refazer ou substituir aparências será tratada como uma transação de ciclo de vida separada. A semântica funcional e o histórico de objetos já são reversíveis; a coleta de recursos não deve ser acoplada à interface.
