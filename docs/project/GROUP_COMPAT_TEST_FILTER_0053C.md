# 0053c — compatibilidade semântica de grupos e filtro de testes falhos

**Baseline:** `20260807-0053b`  
**Build:** `20260807-0053c`

## Problema

A compactação do InstanceGraph converteu a raiz de um grupo em um nó bruto
`kind: "instance"`. Embora `Sandbox.getObject()` projetasse esse nó novamente
como grupo, partes da UI e de ferramentas ainda observavam o snapshot bruto e
perdiam a semântica histórica de `kind: "group"`.

## Correção

Uma instância que referencia uma definição `assembly` preserva semanticamente:

```js
{
  kind: "group",
  instanceKind: "assembly",
  definitionId: "assembly:..."
}
```

`isInstanceNode()` aceita essa forma, portanto o armazenamento continua sendo
uma referência leve e não reexpande os descendentes. Duplicações de assemblies
preservam a mesma identidade semântica.

`SelectionOperations.canUngroup()` e `ungroup()` aceitam tanto a projeção
canônica `kind:"group"` quanto `instanceKind:"assembly"`.

## Complexidade

- agrupar: proporcional aos membros efetivamente agrupados;
- duplicar assembly já definido: `O(1)` sem visitar arestas internas;
- desagrupar: `O(c)`, onde `c` é o número de filhos diretos promovidos;
- memória de uma cópia de assembly: `O(1)`.

Nenhuma geometria é duplicada.

## Runtime test: somente falhas

```text
runtime test all failed
```

Também são aceitos `failures`, `fail`, `failed-only`, `failures-only` e
`falhos`. O resumo mantém `passed`, `failed` e `total` de toda a execução, mas
`results` contém somente testes falhos.

O filtro não esconde falhas nem altera contagens; reduz somente a saída.
