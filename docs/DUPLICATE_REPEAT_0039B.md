# Duplicação e repetição matricial — 0039b

## Objetivo

Este incremento corrige a divergência entre o botão legado, o console e o HUD
adaptativo. A repetição de objetos volta a significar continuar a sequência
afim iniciada por `duplicate`, sem remover a repetição genérica usada por
criação, caminhos e operações topológicas.

## Semântica

`duplicate` cria uma cópia sobreposta e abre uma sequência. Os transforms
iniciais das raízes duplicadas permanecem guardados até `repeat`. A cada
transformação confirmada, o serviço calcula novamente:

```text
Delta_mundo = M_mundo_final × inversa(M_mundo_inicial)
```

Assim, mover, girar e escalar a cópia antes de repetir produz uma matriz
composta. `repeat count N` cria as fronteiras `Delta × M`, `Delta² × M`, ...,
`Deltaᴺ × M` num único `selection.duplicate`. Um undo remove todo o lote e a
seleção passa somente para a última fronteira.

`duplicate count N` sem operações cria `N` cópias sobrepostas e aguarda uma
transformação comum. Com operações afins constantes, ele cria a série
imediatamente e disponibiliza `repeat`. Programas paramétricos continuam sem
repetição matricial porque não possuem um único `Delta`.

A sequência aberta por uma duplicação interativa registra `Delta` no espaço
mundial, inclusive sob grupos transformados. Uma série afim constante explícita
mantém a matriz no espaço local do pai, preservando a semântica anterior da
linguagem e a continuidade de hierarquias existentes.

## Coordenação

Uma réplica pode receber `true` ao enfileirar a intenção antes de possuir os
objetos no snapshot local. Por isso, criação, seleção e histórico de repetição
são publicados em duas fases:

1. IDs, cópias e resultado esperado são preparados antes do dispatch;
2. a seleção e o próximo `repeat` só aparecem quando todos os IDs chegam no
   snapshot confirmado.

Se a coordenação rejeitar a intenção, o estado anterior de repetição é
restaurado. Em nenhum momento a seleção referencia um objeto ausente.

## Superfícies

```text
duplicate
duplicate count N
duplicate count N move|rotate|scale|pivot|matrix ...
repeat
repeat count N
```

HUD e workspace continuam chamando `edit.command.repeat`. Ao abrir uma
duplicação, o ciclo genérico fica temporariamente sem comando. Quando a matriz
delta é confirmada, `SelectionOperations` publica `selection.repeat` como o
comando normalizado. No modo de componentes, `selection.duplicate` permanece
uma repetição topológica normal.

## Critérios

- nomes de cópias começam em `#1`;
- transformações consecutivas compõem a matriz até `repeat`;
- objetos sob pais transformados preservam a mesma matriz no espaço mundial;
- `repeat count N` preserva exatamente a matriz anterior;
- todas as cópias do lote pertencem a um único item de undo;
- somente a fronteira final fica selecionada;
- viewers coordenados aguardam o snapshot antes de selecionar;
- console e HUD executam os mesmos comandos públicos.
