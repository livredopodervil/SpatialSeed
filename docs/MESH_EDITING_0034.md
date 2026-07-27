# Edição adaptativa de malha — build 0034d

O build 0034d amplia a sessão local de edição de vértices com restrições de graus de liberdade, snapping em vértice, aresta e face, deformação procedural parametrizada e histórico interno. O objeto continua isolado do `InstancedMesh`; nenhuma prévia modifica o documento, o sandbox ou outros viewers. Somente **Aplicar** produz `object.geometry.replace`, como uma única entrada no histórico editorial.

## Composição de ferramentas

A transformação não é representada por ferramentas mutuamente exclusivas. Cada operação combina:

```text
transformação
+ frame
+ restrição
+ snap
+ âncora
+ campo de influência
+ expressão
```

Por exemplo: mover no frame congelado do viewer, restrito ao plano `XY`, com snap automático na cena e influência elástica geodésica.

## Restrições

Os modos são `free`, `x`, `y`, `z`, `xy`, `xz` e `yz`. Para um frame ortonormal `B` e uma máscara diagonal `D`, o projetor mundial é `C = B D Bᵀ`. Um deslocamento mundial `d` é resolvido como `C d`. A mesma máscara é aplicada ao gizmo, aos comandos afins e às expressões procedurais. Rotações eliminam componentes de Euler proibidas no frame ativo; escalas substituem fatores proibidos por `1`.

Atalhos durante a sessão:

```text
X, Y, Z       trava um eixo
Shift+X       trava YZ
Shift+Y       trava XZ
Shift+Z       trava XY
Backspace     libera os eixos
Ctrl+Z        desfazer interno
Ctrl+Shift+Z  refazer interno
Ctrl+Y        refazer interno
```

Atalhos não são interceptados enquanto o foco está em `input`, `textarea` ou `select`.

## Snap adaptativo

Os alvos podem ser limitados à malha ativa ou abranger a cena visível. Objetos externos servem apenas como referência: continuam não selecionáveis durante a sessão.

O modo `auto` avalia vértices, arestas e faces. A pontuação inclui distância em pixels, erro residual imposto pela restrição e uma penalidade pequena por tipo, favorecendo vértices sobre arestas e arestas sobre faces quando os candidatos são visualmente equivalentes. Uma histerese mantém o alvo atual até surgir candidato significativamente melhor, reduzindo tremulação.

Para arestas, o parâmetro do segmento é resolvido no subespaço proibido. Se `Q = I - C`, a aresta é `e(s) = e₀ + s(e₁-e₀)`, `u=e₁-e₀` e `r=e₀-a`, então `s = clamp(-(Qu·Qr)/||Qu||²,0,1)`. Isso encontra o ponto da aresta mais compatível com os graus de liberdade antes da avaliação em tela.

Para faces, um eixo travado usa a interseção entre a linha permitida e o plano do triângulo. Uma trava de dois eixos usa a interseção entre o plano de movimento e o plano da face, escolhendo o ponto mais próximo da indicação do ponteiro. Candidatos fora do triângulo são rejeitados; as arestas e vértices da mesma face permanecem candidatos separados.

## Âncoras

- `active`: usa o vértice ativo, quando ele permanece selecionado;
- `pivot`: usa a média mundial da seleção;
- `nearest`: usa o vértice selecionado mais próximo do ponteiro.

O alvo e a linha até a âncora são mostrados no viewer. Vértice, aresta e face usam cores distintas.

## Deformação procedural

As expressões são compiladas uma vez pelo mesmo runtime matemático usado nas operações afins e avaliadas deterministamente para cada vértice afetado. Variáveis disponíveis:

```text
i, count, u                 ordem determinística
vi, gi                      índice de buffer e índice geométrico
lx, ly, lz                  posição local
wx, wy, wz                  posição mundial
fx, fy, fz                  posição no frame ativo relativa ao pivô
nx, ny, nz                  normal mundial
px, py, pz                  pivô mundial
r, q, w                     distância, distância normalizada e peso
t, dt                       tempo, quando fornecido
pi, tau, e, phi, deg, rad   constantes
```

As funções matemáticas incluem `clamp`, `mix`, `step`, `smoothstep`, `smootherstep` e `fract`, além das funções trigonométricas e elementares já existentes.

Métricas de influência:

- `euclidean`: distância mundial direta;
- `geodesic`: menor caminho pelas arestas, calculado por Dijkstra multiorigem;
- `viewer`: distância no plano `XY` do frame ativo;
- `axis`: distância ao longo do eixo métrico escolhido.

Falloffs: `linear`, `smooth`, `smoother`, `gaussian`, `elastic` e `custom`. O preset elástico usa uma oscilação amortecida espacial: `(1-smoothstep(0,1,q))*exp(-damping*q)*cos(frequency*pi*q)`.

Exemplo:

```text
mesh frame viewer
mesh constraint xy
mesh deform move "2*w" 0 0 radius=6 metric=geodesic falloff=elastic damping=2.5 frequency=3
```

Os vértices influenciados recebem cores proporcionais ao peso, mas não entram na seleção.

## Histórico interno

Cada transformação concluída pelo gizmo, comando afim, posicionamento ou deformação procedural cria um snapshot interno das posições. O limite é 100 estados. Desfazer e refazer não chamam o sandbox e não alteram o histórico do projeto. Uma nova operação após `undo` elimina o ramo de `redo`. **Aplicar** consolida o estado corrente em uma única mutação persistente; **Cancelar** descarta a sessão inteira.

## Comandos

```text
mesh enter
mesh status
mesh undo
mesh redo
mesh select all|none|invert
mesh frame world|local|viewer
mesh constraint free|x|y|z|xy|xz|yz
mesh snap on|off
mesh snap mode auto|vertex|edge|face
mesh snap scope active|scene
mesh snap anchor active|pivot|nearest
mesh snap tolerance px
mesh snap self on|off
mesh weld on|off
mesh occlusion on|off
mesh affine move|rotate|scale x y z
mesh deform move|rotate|scale exprX exprY exprZ radius=n metric=euclidean|geodesic|viewer|axis falloff=linear|smooth|smoother|gaussian|elastic|custom
mesh apply
mesh cancel
```

## Limitações

A edição permanece baseada em vértices de `BufferGeometry`; costuras de UV e normais duras podem produzir registros coincidentes, administrados pela opção de soldagem. O build não altera topologia: não cria nem remove vértices, arestas ou faces. Snap de cena percorre um orçamento finito de primitivas por quadro; um BVH poderá substituir essa busca quando malhas muito grandes justificarem a dependência.

## Roteiro de validação visual

1. Selecione um único objeto, abra **Editar → Editar malha** e confirme que somente seus vértices aparecem e podem ser selecionados.
2. Teste `X`, `Y`, `Z`, `XY`, `XZ` e `YZ` nos frames mundo, objeto e viewer travado; o gizmo e `mesh affine` devem produzir deslocamentos equivalentes.
3. Ative snap em `vertex`, `edge`, `face` e `auto`, primeiro na malha ativa e depois na cena. Objetos externos devem servir apenas como referências, sem entrar na seleção.
4. Durante o snap, confirme o marcador do alvo e a linha da âncora, inclusive após pequenos movimentos que exercitem a histerese.
5. Execute uma deformação `elastic` com métrica `geodesic`; os vértices influenciados devem mudar de cor sem serem acrescentados à seleção.
6. Faça várias operações, use **Desfazer interno** e **Refazer interno**, crie uma nova operação após desfazer e confirme que o ramo antigo de redo é descartado.
7. Pressione **Cancelar** e confirme a restauração integral. Repita, pressione **Aplicar** e confirme que o histórico editorial recebe apenas uma entrada.
