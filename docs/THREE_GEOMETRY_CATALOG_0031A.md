# Catálogo geométrico Three.js — 0031a

O `GeometryRegistry` cobre todas as geometrias de malha do núcleo Three.js
`r185` que podem ser projetadas corretamente pelo renderer atual como
`THREE.Mesh`. O projeto passa a oferecer 21 famílias: cinco já existentes,
quinze classes geométricas adicionais do Three.js e uma família `buffer` para
malhas triangulares declarativas.

## Famílias

| type | Three.js | parâmetros principais |
|---|---|---|
| `box` | `BoxGeometry` | `size`, `segments` |
| `sphere` | `SphereGeometry` | raio, segmentos e recortes angulares |
| `cylinder` | `CylinderGeometry` | raios, altura, segmentos, abertura e arco |
| `plane` | `PlaneGeometry` | largura, altura e segmentos |
| `polygon` | `CircleGeometry` | lados, raio e ângulo inicial |
| `capsule` | `CapsuleGeometry` | raio, altura e segmentos |
| `circle` | `CircleGeometry` | raio, segmentos e setor angular |
| `cone` | `ConeGeometry` | raio, altura, segmentos, abertura e arco |
| `dodecahedron` | `DodecahedronGeometry` | raio e detalhe |
| `icosahedron` | `IcosahedronGeometry` | raio e detalhe |
| `octahedron` | `OctahedronGeometry` | raio e detalhe |
| `ring` | `RingGeometry` | raios, segmentos e setor angular |
| `tetrahedron` | `TetrahedronGeometry` | raio e detalhe |
| `torus` | `TorusGeometry` | raios, segmentos e arcos |
| `torus-knot` | `TorusKnotGeometry` | raios, segmentos, `p` e `q` |
| `lathe` | `LatheGeometry` | perfil 2D, segmentos e arco |
| `tube` | `TubeGeometry` | caminho 3D, raio e interpolação |
| `shape` | `ShapeGeometry` | contorno 2D, furos e segmentos |
| `extrude` | `ExtrudeGeometry` | contorno, furos, profundidade e bisel |
| `polyhedron` | `PolyhedronGeometry` | vértices, índices, raio e detalhe |
| `buffer` | `BufferGeometry` | posições, índices, normais e UVs |

Parâmetros complexos são JSON serializável. Exemplos:

```text
create lathe points '[[0,-1],[1,-1],[1,1],[0,1]]' segments 32
create tube points '[[-2,0,0],[0,1,0],[2,0,0]]' radius 0.2
create shape contour '[[-1,-1],[1,-1],[1,1],[-1,1]]'
create extrude contour '[[-1,-1],[1,-1],[1,1],[-1,1]]' depth 2
create buffer positions '[[-1,0,0],[1,0,0],[0,1,0]]' indices '[0,1,2]'
```

O painel **Criar** é gerado por `GeometryRegistry.describe()` e passou a
entender `enum`, `json` e vetores inteiros, além dos tipos anteriores. O console
consulta o mesmo registro para descobrir famílias, defaults e parâmetros; não
mantém uma lista paralela.

## Classes deliberadamente fora do catálogo

`EdgesGeometry` e `WireframeGeometry` produzem segmentos de linha, mas o
renderer geométrico atual cria `Mesh`/`InstancedMesh`. Registrá-las como malhas
triangulares produziria desenho incorreto. Elas devem entrar futuramente com um
provider de primitiva `line-segments`, material de linha e lote próprio.

`InstancedBufferGeometry` é infraestrutura de instanciamento, não uma família
de forma. O SpatialSeed já controla instâncias na camada `instance-batches`; um
provider separado duplicaria autoridade e poderia criar instanciamento
aninhado.

Geometrias de `examples/jsm`, como `TextGeometry`, `ConvexGeometry`,
`DecalGeometry`, `ParametricGeometry` e `RoundedBoxGeometry`, não pertencem ao
núcleo Three.js vendorizado neste build. Cada uma exige também vendorização do
addon e, em alguns casos, assets ou callbacks não serializáveis.

## Compatibilidade

Descritores antigos permanecem válidos. Novos campos de segmentação e ângulo
recebem defaults na normalização. O arquivo espacial continua armazenando
apenas descritores declarativos; a `BufferGeometry` concreta é criada e
compartilhada pelo cache do renderer.
