# Seleção e duplicação em lote 0019d

`Selection.replaceMany()` substitui todos os membros com uma única notificação.

O console passa a aceitar:

```text
duplicate
duplicate count 10
duplicate count 100
```

`duplicate count N` cria `N` cópias de cada objeto selecionado em um único comando do Sandbox.

Os nomes passam a usar sufixos compactos (`Caixa #2`, `Caixa #3`) em vez de acumular “cópia”.

Esta etapa reduz o custo editorial e de seleção. O renderer ainda mantém um `THREE.Mesh` por objeto; dezenas de milhares de objetos visíveis exigem `THREE.InstancedMesh`.
