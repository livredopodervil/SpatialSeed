# 0043x — animação, repeat e UI declarativa de catálogos

Base de preparação: `da18ca8` (`20260730-0042c1`).

## Regressões corrigidas

1. Objetos-raiz criados pelo caminho incremental localizado passam a agendar a
   atualização do `HierarchyIndex`. A captura de alvos de animação também força
   uma atualização sob demanda quando o visual existe, mas o índice ainda não
   contém o objeto.
2. Transformações emitidas enquanto uma duplicação coordenada ainda está na fila
   usam os objetos duplicados preparados, e não a seleção antiga. `repeat` pode
   ser solicitado antes da confirmação do delta; a intenção fica deferida e é
   executada quando a última transformação pendente consolida o histórico.

## UI declarativa no catálogo existente

O esquema continua sendo `spatial-seed-procedure-library-v1`. Cada procedure pode
agora conter um campo opcional `ui`:

```json
{
  "name": "architecture.colonnade",
  "source": "({count=8}={}) => { ... }",
  "ui": {
    "label": "Colunata",
    "description": "Cria uma sequência de colunas.",
    "icon": "▥",
    "group": "Arquitetura",
    "order": 10,
    "commit": "review",
    "parameters": [
      {
        "id": "count",
        "type": "integer",
        "label": "Colunas",
        "default": 8,
        "min": 1,
        "max": 500
      }
    ]
  }
}
```

Tipos normalizados: `number`, `integer`, `boolean`, `text`, `color`, `select` e
`vector3`. O modo `review` prepara o plano e exige confirmação; `immediate`
prepara e confirma em uma ação.

A interface usa apenas `textContent`, controles conhecidos, queries e comandos
registrados. O catálogo não injeta HTML nem listeners arbitrários.

Editar somente o código-fonte de uma procedure pelo editor preserva seus
metadados `ui`. Importação, exportação, persistência, merge e detecção de conflito
passam a considerar esses metadados.

## Uso

Importe `examples/catalogs/spatialseed-procedure-ui-0043x.json` pelo botão
**Importar procedimentos**. Abra **Editor de procedimentos**. A seção
**Interface do catálogo** será gerada abaixo do editor individual.

## Verificação no aplicativo

No console do SpatialSeed:

```text
runtime test all
```

Teste manual mínimo:

```text
select only box-1
duplicate
move 2 0 0
repeat count 4
```

O último comando deve ser aceito mesmo quando duplicação e transformação ainda
estiverem sendo confirmadas pela fila coordenada. Um objeto criado depois da
inicialização deve poder ser selecionado como alvo e animado imediatamente.
