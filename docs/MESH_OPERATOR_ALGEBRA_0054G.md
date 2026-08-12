# SpatialSeed 0054g — álgebra de operadores e interação por caminho

## Estado

Esta etapa é deliberadamente incremental. Ela não tenta introduzir ainda o conjunto
completo de ferramentas de modelagem. O objetivo é estabelecer contratos que possam
ser reutilizados por `extrude`, `knife`, `knife project`, `bisect`, operações de loop
e, posteriormente, booleanas robustas.

## Princípio de separação

A edição é dividida em três camadas:

1. **álgebra/topologia** — opera apenas sobre a malha e dados matemáticos;
2. **interação** — converte cursor/toque em entidades matemáticas, como caminhos;
3. **superfícies de comando** — HUD, painel, console e scripts invocam a mesma operação.

O núcleo não conhece DOM, eventos de ponteiro ou Three.js. O adaptador de interação
não implementa topologia: ele pede ao renderer somente uma projeção ponteiro→plano e
entrega uma polilinha 3D local ao `mesh-editor-core`.

## Contrato de operador

`packages/mesh-operator-kernel` publica descritores serializáveis. Um operador declara:

- domínio topológico;
- modos de componente aceitos;
- primitivas algébricas conceituais;
- tipo de interação, quando houver;
- invariantes que pretende preservar;
- categorias de células que pode produzir.

A extrusão é descrita inicialmente pela composição conceitual:

`duplicate-front → stitch-boundary → translate-front`.

Isso ainda usa internamente o operador de extrusão existente; o contrato existe para
permitir que essa implementação seja substituída sem alterar HUD, console ou gestos.

## Caminhos

O contrato canônico de caminho é uma polilinha em **coordenadas locais da malha**.
Existem quatro modos:

- `drag-line`: usa apenas o primeiro e o último ponto do gesto;
- `drawn`: conserva a polilinha desenhada, com simplificação opcional;
- `normal`: compatibilidade com a extrusão anterior por normal/distância;
- `explicit`: caminho fornecido diretamente por comando/script.

O modo padrão de `mesh.extrude` é `drag-line`.

Para um caminho `p_0, ..., p_n`, a operação por caminho compõe extrusões pelos vetores
`d_i = p_(i+1) - p_i`. A frente criada por um segmento torna-se a seleção usada pelo
segmento seguinte. Dessa forma o operador não depende da origem do caminho.

A simplificação de um traço usa Ramer–Douglas–Peucker. A tolerância exposta pela UI é
relativa à diagonal espacial do traço, evitando uma constante absoluta dependente da
escala do modelo.

## Preview transacional

`MeshEditController` ganha um preview topológico explícito:

- `previewTopology()` calcula sempre a partir do snapshot-base do gesto;
- `commitTopologyPreview()` registra o resultado no histórico interno;
- `cancelTopologyPreview()` restaura exatamente o snapshot-base.

Isso evita acumular uma extrusão nova para cada evento `pointermove`.

## Referências arquiteturais

A direção segue a separação usada pelo BMesh do Blender entre conectividade e
operadores locais de Euler. Ferramentas de corte do Blender, como Knife e Intersect
Knife, são tratadas como cortes topológicos sobre a malha, e não como edição direta de
buffers de renderização. Para booleanas futuras, Manifold é candidato a backend
substituível via WASM, mantendo uma interface `BooleanKernel` própria do SpatialSeed.

Referências públicas consultadas nesta etapa:

- Blender BMesh design / Euler operators: https://developer.blender.org/docs/features/objects/mesh/bmesh/
- Blender Knife tool: https://docs.blender.org/manual/en/latest/modeling/meshes/tools/knife.html
- Blender Intersect (Knife): https://docs.blender.org/manual/en/latest/modeling/meshes/editing/face/intersect_boolean.html
- Manifold: https://manifoldcad.org/docs/jsuser/

## Superfícies públicas 0054g

### HUD e painel

`mesh.extrude` oferece:

- Reta pelo arrasto;
- Caminho desenhado;
- Normal / distância.

### Console

Compatibilidade antiga:

`mesh topology extrude distance=1`

Interação iniciada pelo console:

`mesh topology extrude pathMode=drag-line`

`mesh topology extrude pathMode=drawn pathSamplePixels=6 pathSimplify=0.004`

Operação inteiramente declarativa, adequada também a scripts:

`mesh topology extrude path=0,0,0;1,0,0;1,1,0`

### Queries

- `mesh.path.status`
- `mesh.operators.contracts`

## Próxima camada

A ordem pretendida é:

1. completar primitivas de Euler e IDs topológicos estáveis;
2. `connect`, `rip`, `dissolve` e split lógico de face;
3. `knife`, `bisect` e `knife project` usando a mesma primitiva de caminho;
4. aceleração espacial compartilhável para interseções;
5. backend substituível para booleanas robustas;
6. preservação explícita de corner attributes durante mudanças topológicas.

Em paralelo, o runtime de jogo deve permanecer um orquestrador. Comportamentos por
objeto serão consumidores do barramento de eventos e deverão produzir intenções ou
comandos, não depender diretamente de renderer, editor ou física.
