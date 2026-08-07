# Modelo de complexidade e memória — 0053a

## Símbolos

`D`: definições; `I`: instâncias autoritativas; `E`: arestas de assembly; `G`: geometria única; `O`: overrides; `H`: profundidade; `F`: folhas materializadas; `V`: folhas visíveis; `P`: previews; `S`: seleção; `A`: operações temporais; `C`: candidatos de picking; `B`: shards; `M`: elementos de mesh edit; `K`: entidades efetivamente alteradas.

## Alvos normativos

| Contexto | CPU alvo | Memória adicional |
|---|---:|---:|
| cena parada | `O(1)` | `O(1)` |
| resolve ocorrência | `O(H)`, cache `O(1)` | `O(1)` |
| selecionar folha | `O(log F + C)` | `O(1)` |
| mover folha | `O(H + log B)` | `O(1)` |
| mover assembly | semântico `O(1)`, visual `O(Vd)` | `O(1)` |
| duplicar folha | `O(1)` | `O(1)` |
| duplicar assembly | `O(1)` | `O(1)` |
| delete raiz | `O(1)` | `O(1)` |
| delete descendente | `O(H)` | `O(1)` override |
| Inspector | `O(SH)`, cache `O(S)` | `O(S)` |
| preview | `O(Kp)` | `O(P)` |
| animação | `O(A)` lógico | `O(A)` |
| frustum | `O(Bc + V)` | `O(B)` |
| mesh edit | `O(M)` | `O(M)` |
| save | `O(D + I + E + O + G)` | proporcional ao semântico |

## Violações proibidas

- editar uma folha: `O(I)`;
- alterar propriedade: `O(I)`;
- duplicar assembly: `O(E)`;
- duplicar objeto: `O(G)`;
- cena ociosa: `O(F)` por frame;
- Inspector: `structuredClone(world)`;
- save: expansão de folhas derivadas;
- renderer: resolução de hierarquia semântica;
- ferramenta: mutação direta de Three.js.

## Contadores executáveis

`packages/complexity-audit` introduz contadores estruturais. Big-O não é inferido por cronômetro; é auditado pelo número de entidades visitadas, snapshots integrais, bytes clonados, dirty nodes, dirty shards, candidatos de picking e subscribers notificados.

`globalSnapshotsRequested` deve permanecer `0` no uso normal.
