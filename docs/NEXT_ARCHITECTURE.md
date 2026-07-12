# Próxima evolução arquitetural

## 0018a — contratos e modelo

```text
packages/world-model/src/
  WorldSnapshot.js
  WorldDelta.js
  CommitEnvelope.js
  PrototypeStore.js
  InstanceStore.js
```

Objetivos: snapshot versionado e imutável, deltas explícitos, protótipos compartilhados, instâncias leves, copy-on-write e conversão temporária do modelo legado. O renderer atual ainda não será substituído.

## 0018b — separação dos níveis

```text
packages/editor-session/
packages/sandbox-replica/
packages/region-authority/
```

Objetivos: estado editorial transitório separado, sandbox como réplica especulativa, região como autoridade, comunicação por envelopes e deltas e testes das fronteiras de conhecimento.

## 0018c — atualização incremental

Objetivos: `getSnapshot()` sem clone, `getState()` defensivo apenas nas fronteiras, uma referência compartilhada por notificação, índices por identificador, renderer atualizado por mudanças e benchmark de subscribers e deltas.

## 0018d — renderer com instâncias

```text
packages/renderer-three/src/
  PrototypeResources.js
  InstanceBatch.js
  DeltaRenderer.js
```

Objetivos: geometria e materiais compartilhados, `THREE.InstancedMesh`, seleção por instância, atualização unitária e comparação objetiva com meshes independentes.

## Testes arquiteturais

```text
test layers
test snapshots
test synchronization
test instances
test copy-on-write
test all
```
