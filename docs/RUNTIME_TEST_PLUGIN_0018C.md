# Runtime Test Plugin 0018c

Plugin isolado para validar a separação entre Viewer, Editor e simulador global.

## Comandos

```text
runtime test help
runtime test viewer
runtime test editor
runtime test clock
runtime test simulation
runtime test property-contract
runtime test all
```

## Cobertura

- estado local do viewer;
- preview editorial sem publicação;
- commit editorial único;
- cancelamento de operação;
- relógio de passo fixo;
- limite de catch-up;
- aceitação por versão;
- rejeição de conflito;
- evolução autônoma do simulador.
- contrato atômico de propriedades, aparência, textura e instância.

O plugin recebe somente o registro de comandos. Não recebe Region, Sandbox, renderer ou DOM.
