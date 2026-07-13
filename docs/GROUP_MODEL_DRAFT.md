# Modelo de grupos — rascunho arquitetural

Um grupo será uma entidade transportável e instanciável, não apenas uma seleção persistida.

```text
GroupDefinition
  id
  root
  members
  internalConstraints
  internalScripts
  metadata

GroupInstance
  groupDefinitionId
  transform
  overrides
```

Cada membro mantém transform local em relação à raiz: `worldTransform = groupInstanceTransform × memberLocalTransform`.

A região externa pode tratar o grupo como unidade, enquanto sua estrutura e dinâmica internas permanecem encapsuladas. Definições podem ser compartilhadas por várias instâncias, transportadas entre regiões e tornadas únicas por copy-on-write.
