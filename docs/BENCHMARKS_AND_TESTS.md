# Benchmarks e testes

## Console

```text
benchmark help
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

`benchmark scene` recebe o número total de objetos, o número de amostras e o número de objetos transformados no lote. O benchmark usa um Sandbox isolado e não modifica a cena ativa.
