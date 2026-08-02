# Benchmarks e testes

## Console

```text
benchmark help
benchmark compact 10000 1000 5
benchmark scene 1000 5 100
benchmark compare
benchmark history
benchmark clear

test help
test all
test sandbox
test reducer
test commands
test project
```

`benchmark scene` recebe o número total de objetos, o número de amostras e o
número de objetos transformados no lote. `benchmark compact` mede famílias,
instancing, traços segmentados, paginação virtual e cena lógica na linha de base
canônica. Ambos usam um Sandbox isolado e não modificam a cena ativa. Os gates e
o método comparativo estão em
[`project/BASELINE_GATES.md`](project/BASELINE_GATES.md).
