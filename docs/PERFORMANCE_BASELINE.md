# Linha de base de desempenho — build 0017

## Testes automatizados

```text
test all
```

Resultado inicial: 8 aprovados, 0 falhas, 6,3 ms.

## Medianas medidas

| Objetos | Criar cena | replaceState | cloneState | Transformar 1 | Transformar lote | stringify | validate |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 0,10 ms | 1,10 ms | 0,70 ms | 0,20 ms | 0,25 ms | 0,10 ms | 1,80 ms |
| 1.000 | 0,90 ms | 9,80 ms | 6,10 ms | 0,60 ms | 1,60 ms | 0,70 ms | 19,75 ms |
| 5.000 | 7,90 ms | 52,10 ms | 37,80 ms | 1,80 ms | 8,10 ms | 4,40 ms | 96,10 ms |

Tamanhos serializados: 17.890 bytes, 179.425 bytes e 909.429 bytes.

## Interpretação

O comportamento é predominantemente linear. Os gargalos medidos são validação, substituição integral do estado, clonagem integral e notificações que clonam o estado por subscriber. A transformação ainda não é o custo dominante.

## Próximos benchmarks

```text
benchmark notify 5000 1
benchmark notify 5000 5
benchmark notify 5000 10
benchmark instances 1000
benchmark instances 10000
benchmark instances 50000
benchmark delta 5000 1
benchmark renderer meshes 5000
benchmark renderer instances 5000
```
