# Performance 0020b-a

## Métrica introduzida

Execute no console:

```text
runtime benchmark api 10000
```

O resultado compara:

1. execução direta no `CommandRegistry`;
2. execução pela fachada `SpatialSeedRuntime.execute()`.

Campos:

- `directMs`: tempo direto total;
- `facadeMs`: tempo total pela API;
- `overheadMs`: diferença total;
- `overheadPerCallUs`: sobrecarga por chamada em microssegundos;
- `ratio`: razão entre fachada e chamada direta.

## Critério

A mudança é aceitável quando:

- `runtime test all` permanece integralmente verde;
- `overheadPerCallUs` é finito e documentado;
- criação, seleção, transformação afim e repeat permanecem visualmente iguais;
- draw calls e recursos não aumentam para a mesma cena.

Os números dependem do aparelho e devem ser registrados no relatório do
commit. Não existe valor pré-fabricado no código.

## Resultado no Android/Termux — 2026-07-14

Três execuções com 10.000 chamadas:

| execução | direto | fachada | sobrecarga | por chamada | razão |
|---:|---:|---:|---:|---:|---:|
| 1 | 57,5 ms | 121,4 ms | 63,9 ms | 6,39 µs | 2,111 |
| 2 | 58,6 ms | 120,9 ms | 62,3 ms | 6,23 µs | 2,063 |
| 3 | 58,1 ms | 120,3 ms | 62,2 ms | 6,22 µs | 2,071 |

Mediana da sobrecarga: **6,23 µs por chamada**.

A razão próxima de 2 ocorre porque o comando medido é um `noop`.
Ela não representa duplicação do custo de comandos reais; representa
principalmente o custo fixo de medição, clonagem dos argumentos e passagem
pela fachada.

Estado gráfico da cena padrão após a alteração:

- 3 objetos lógicos;
- 3 lotes instanciados;
- 1 geometria única;
- 3 materiais;
- 17 chamadas de renderização no instante medido;
- nenhuma alteração no número lógico de objetos ou recursos compartilhados.
