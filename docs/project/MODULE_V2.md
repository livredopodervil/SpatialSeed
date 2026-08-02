# Contrato canônico de módulos v2

Status: implementado inicialmente no build `0047b`

## Objetivo

`spatial-seed-module-v2` é a única fronteira de ativação de módulos internos do
SpatialSeed. Ele separa três coisas que o contrato anterior misturava:

1. manifesto serializável e inspecionável;
2. factory confiável, que contém o código embutido;
3. resultado candidato, que contém capabilities e payloads declarados.

O registro não adota DOM, não conhece Three.js e não recebe stores globais. Ele
resolve dependências e capabilities, ativa um conjunto candidato e só torna
esse conjunto consultável depois que todos os módulos foram concluídos.

## Definição embutida

Uma definição possui exatamente `manifest` e `createModule`:

```js
{
  manifest: {
    manifestVersion: "spatial-seed-module-v2",
    id: "spatialseed.document.region-box",
    version: "1.0.0",
    requires: { modules: [], capabilities: [] },
    provides: { capabilities: [] },
    contributes: {
      reducers: [{
        id: "spatialseed.document.reducer.box-region",
        apiVersion: "spatial-seed-region-reducer-v1"
      }]
    },
    permissions: []
  },
  createModule(scope) {
    return {
      activate() {
        return {
          contributions: {
            reducers: {
              "spatialseed.document.reducer.box-region": reducer
            }
          }
        };
      },
      dispose() {}
    };
  }
}
```

O manifesto não aceita funções nem campos legados. IDs de módulo e contribuição
são qualificados; versões de módulo usam semver; IDs de capability terminam em
versão explícita, como `document.commands.v1`. O factory recebe somente as
capabilities enumeradas em `requires.capabilities`.

## Validação anterior aos efeitos

Antes de criar a primeira instância, `ModuleRegistry.validate` e
`activateAll` verificam:

- forma e versão de todos os manifestos;
- módulos ausentes, auto-dependência e ciclos;
- providers únicos para cada capability;
- dependência explícita do módulo que fornece uma capability;
- ownership único de cada par `kind:id` de contribuição;
- conflito entre capability embutida e capability do host.

Depois de cada `activate`, o resultado deve conter exatamente as capabilities,
kinds e IDs declarados. Payload ausente, extra ou com referência diferente
aborta o candidato.

## Commit, rollback e descarte

O registro mantém o conjunto ativo anterior enquanto constrói o candidato. As
capabilities e contribuições candidatas permanecem privadas. Se todas as
ativações terminarem, o snapshot ativo é trocado de uma vez. Se uma falhar, a
instância que falhou e todas as instâncias candidatas anteriores recebem
`dispose` em ordem inversa; o snapshot anterior permanece ativo.

Módulos não devem produzir efeitos externos irreversíveis durante `createModule`
ou `activate`. Uma capability que permita efeito externo deverá expor uma porta
transacional ou um cancelamento registrado no `dispose`. As duas adaptações
iniciais são puras: apenas retornam referências já construídas, portanto seu
rollback não depende de compensação externa.

`resolveContribution(kind, id)` e `resolveCapability(id)` consultam somente o
snapshot ativo. `describe()` expõe manifesto, estado e status serializável, mas
nunca os handlers ou payloads.

## Primeira migração

O boot `0047b` registra somente duas definições v2:

- `spatialseed.document.region-box`, que publica o mesmo `boxRegionReducer`;
- `spatialseed.procedural.experiments.starter`, que publica as mesmas três
  definições de experimento.

O composition root resolve o reducer depois do commit do registro. O
`ExperimentRegistry.registerCatalog` normaliza o catálogo inteiro e verifica
todas as identidades antes de inserir a primeira definição. Foram removidos o
`Map` mutável de reducers, a capability genérica `experiments`, o `EventBus` sem
consumidor e a ativação que modificava diretamente o catálogo.

Esta etapa não muda comandos, geometrias, ferramentas, HUD, programas nem
formato de projeto.

## Verificação

No aplicativo:

```text
runtime test module-v2
runtime test experiment-contract
runtime test experiment-plugin
runtime test all
benchmark compact 10000 1000 5
```

A suíte v2 cobre isolamento de capability, ordem topológica, módulo ausente,
ciclo, referência de contribuição inválida, rollback inverso, preservação do
snapshot anterior e descarte inverso do conjunto ativo.
