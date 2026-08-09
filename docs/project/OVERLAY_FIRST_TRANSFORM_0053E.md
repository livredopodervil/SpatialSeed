# 0053e — Overlay-first transform architecture

O `OccurrenceTransformHierarchy` usa `OccurrenceResolver` como autoridade de
parent/local/world e não cria um mapa global de `scene.objects` por operação.

## Invariantes

- previews de move/rotate/scale só escrevem `FastTransformOverlay` e proxies do renderer;
- o modelo lógico é alterado apenas por `selection.transform-world` no commit;
- duplicação simples preserva a transformação local em relação ao parent;
- o pivot é estado da ferramenta; o default `anchor` usa a âncora do alvo ativo e orientação local;
- `median`, `bounds`, `active` e `custom` continuam explícitos;
- `anchorRef` pode apontar para outro objeto sem alterar a relação parent/child.

Console:

```text
anchor reference <object-id>
anchor reference <object-id> x y z
```

## Complexidade

Resolução fria de transform é O(H), sendo H a profundidade da ocorrência;
cache hit é O(1). Não há scan global no novo hierarchy runtime. Preview e
animação devem manter `logicalWrites = 0` até commit.
