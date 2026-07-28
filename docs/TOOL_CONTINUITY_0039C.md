# Continuidade isolada das ferramentas — 0039c

## Problema

A prova de continuidade usava implicitamente o `localStorage` real do
navegador. Se `path.sketch` já estivesse configurada como não contínua, o
produto respeitava `false`, mas o teste esperava o padrão `true`. Além disso,
uma escrita sem ação ativa alterava simultaneamente `object.place` e
`path.sketch`, e o comando podia sincronizar uma sessão diferente daquela
indicada por `toolId`.

## Contrato

`ToolLifecycleController` resolve uma única identidade nesta ordem:

1. `toolId` fornecido pelo chamador;
2. ação interativa ativa;
3. ferramenta editorial corrente.

`status().toolId`, `status().keepActive`, `keepActive()` e
`setKeepActive()` usam a mesma resolução. A escrita atualiza somente essa
identidade. O comando `edit.tool.keep.set` também encaminha o valor apenas ao
controlador interativo correspondente.

## Persistência e migração

O registro corrente é:

```json
{
  "schemaVersion": 2,
  "defaultKeepActive": true,
  "keepByTool": {
    "object.place": true,
    "path.sketch": true
  }
}
```

Ele é salvo em `spatialseed.edit.tools.v2`. Na primeira abertura sem esse
registro, valores booleanos válidos de `spatialseed.edit.tools.v1` são
importados. O registro legado não é removido nem reescrito. Depois da migração,
`v2` tem precedência.

Preferências inválidas ou armazenamento indisponível não impedem o editor de
iniciar; os padrões permanecem somente na sessão. Um registro com versão futura
desconhecida é conservado intacto e não é interpretado nem substituído.

## Isolamento dos testes

As provas do lifecycle usam armazenamento em memória injetado. O contrato cobre:

- padrões vazios;
- independência entre posicionamento e desenho;
- resolução pela ferramenta corrente;
- recarga sobre o mesmo armazenamento;
- migração `v1 → v2` sem perda;
- precedência de `v2`;
- preservação de versões futuras desconhecidas;
- sincronização exclusiva da sessão alvo.

## Fronteira

Este marco corrige somente a continuidade (`keepActive`). Parâmetros,
presets, schemas de formulários, preview geométrico e layout da interface
pertencem ao futuro registro canônico de ferramentas e não são simulados neste
armazenamento.
