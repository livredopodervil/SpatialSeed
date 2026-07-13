# World Model 0018a

Primeira etapa isolada do novo modelo de mundo.

## Módulos

- `Immutable.js`
- `WorldSnapshot.js`
- `WorldDelta.js`
- `CommitEnvelope.js`
- `PrototypeStore.js`
- `InstanceStore.js`
- `index.js`

## Responsabilidades

`WorldSnapshot` representa um estado versionado, imutável e serializável.

`WorldDelta` representa mudanças aceitas entre duas versões.

`CommitEnvelope` transporta comandos finais de um cliente para uma região.

`PrototypeStore` mantém descrições compartilhadas de geometria e material.

`InstanceStore` mantém transformações individuais e implementa copy-on-write por `makeUnique()`.

## Limites desta etapa

Nenhum arquivo existente do núcleo é alterado.

Não há integração com:

- `Region`;
- `Sandbox`;
- renderer;
- console;
- seleção;
- persistência `.spatialseed`.

A próxima etapa deve criar um plugin de testes e comandos para validar o modelo sem acoplar o núcleo.
