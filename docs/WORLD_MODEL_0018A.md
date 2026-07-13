# Modelo de mundo 0018a

Esta etapa introduz contratos e estruturas sem substituir ainda o estado legado ou o renderer.

## Novos contratos

```text
WorldSnapshot
WorldDelta
CommitEnvelope
PrototypeStore
InstanceStore
LegacyWorldAdapter
```

## Otimização de snapshots

`Region` e `Sandbox` passam a oferecer duas leituras:

```text
getSnapshot()  referência interna imutável, sem clone
getState()     cópia defensiva para fronteiras externas
```

Todos os subscribers de uma mesma notificação recebem exatamente o mesmo snapshot.

## Migração gradual

O estado atual `objects[]` continua sendo o formato operacional do editor. `LegacyWorldAdapter` converte esse estado para protótipos e instâncias para testes, benchmarks e futura migração.

## Instâncias e copy-on-write

Objetos equivalentes compartilham protótipo. `InstanceStore.makeUnique()` cria uma variante e altera somente a instância solicitada.

## Limite desta etapa

Ainda não são substituídos o reducer legado, o formato `.spatialseed`, o renderer, a seleção nem o Inspector.
