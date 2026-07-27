# Edição topológica unificada de malha — build 0035a

## Escopo

O editor de malha passa a tratar vértices, arestas e faces como componentes da mesma sessão local. A superfície persistente continua sendo uma `BufferGeometry` triangular, enquanto a sessão reconstrói uma representação topológica transitória com meia-arestas, pares opostos, adjacências, arestas soltas, arestas de contorno e ciclos de contorno.

A prévia permanece exclusivamente no viewer. Nenhuma operação modifica a geometria compartilhada do cache. **Aplicar** converte o resultado em um único comando `object.geometry.replace`; **Cancelar** descarta toda a sessão; o histórico interno guarda descritor e seleção completos após cada operação.

## Modelo matemático

Uma face triangular orientada é o trio ordenado `(a,b,c)`. A ordem determina a normal pela orientação do produto vetorial `(p_b-p_a) × (p_c-p_a)`. Inverter a normal troca dois índices, por exemplo `(a,b,c) → (a,c,b)`.

Cada lado orientado de uma face produz uma meia-aresta com referências para `next`, `previous`, `face` e `twin`. Duas meias-arestas são gêmeas quando possuem os mesmos extremos em sentidos opostos. Uma meia-aresta sem gêmea pertence ao contorno; uma aresta associada a mais de duas faces é não manifold.

Ao criar uma face com mais de três vértices, o sistema calcula o centroide e o tensor de covariância das posições. O autovetor associado ao menor autovalor fornece a normal do plano de melhor ajuste. Os pontos são projetados nesse plano, ordenados angularmente e triangulados por *ear clipping*. Essa solução aceita polígonos inclinados e moderadamente não coplanares, mas rejeita conjuntos colineares ou degenerados.

## Modos de componente

Atalhos:

```text
1  vértices
2  arestas
3  faces
```

A seleção pontual e retangular respeita exclusivamente o modo ativo. Outros objetos nunca se tornam selecionáveis durante a sessão, embora possam continuar servindo como referências de snap.

Operações de seleção:

```text
Todos
Nenhum
Inverter
Expandir
Contrair
Conectados
Contorno
Selecionar por normal
```

## Operações primitivas

As operações abaixo formam o núcleo topológico. Operações compostas futuras, como bevel, knife ou loop cut, devem ser implementadas como sequências auditáveis desses primitivos ou como novos operadores puros sobre o mesmo modelo.

### Vértices

- criar vértice em coordenadas locais;
- excluir vértices e as faces incidentes;
- duplicar;
- extrudar, criando arestas entre origem e cópia;
- soldar a um vértice ativo ou à posição média;
- transformar com gizmo, comandos afins ou campo procedural;
- limpar vértices sem referência.

### Arestas

- criar aresta solta entre dois vértices;
- excluir a aresta e faces incidentes;
- duplicar;
- extrudar, criando uma faixa quadrilateral triangulada;
- dividir em parâmetro `0 < t < 1`;
- colapsar;
- inverter a diagonal entre dois triângulos;
- criar ponte entre dois ciclos completos de contorno com igual cardinalidade;
- selecionar contornos, conectadas, expandir e contrair.

### Faces

- criar/preencher uma face a partir de três ou mais vértices;
- excluir;
- duplicar;
- extrudar uma região, preservando as faces laterais de seu contorno;
- inset triangular;
- subdividir pelo centroide;
- inverter orientação/normal;
- selecionar por normal e conectividade;
- recalcular normais.

## Regras de integridade

As opções do painel podem:

- bloquear resultados com arestas não manifold;
- preservar contornos em colapso e soldagem;
- remover vértices sem uso;
- recalcular normais no commit.

Triângulos com índices repetidos ou área praticamente nula são removidos durante a finalização. Índices, arestas soltas e atributos são remapeados quando vértices são compactados.

## Painel único configurável

O painel **Editar → Editar malha** contém todas as ferramentas em uma única janela flutuante e redimensionável. A seção **Configurar painel** contém checkboxes para exibir ou ocultar:

```text
Sessão
Seleção
Topologia
Transformação
Snap
Influência
Diagnóstico
```

A composição escolhida é persistida localmente em:

```text
localStorage["spatialseed.mesh.panel.sections.v1"]
```

As opções visuais de vértices, arestas, faces e modo raio X afetam apenas o viewer.

## Console

```text
mesh mode vertex|edge|face
mesh select all|none|invert|grow|shrink|linked|boundary|normal [ângulo]

mesh create-vertex position=0,1,0
mesh create-edge
mesh create-face
mesh duplicate
mesh delete
mesh extrude 1
mesh inset amount=0.2
mesh split parameter=0.5
mesh subdivide
mesh collapse
mesh flip-edge
mesh flip-normal
mesh bridge
mesh weld
mesh fill
mesh cleanup
mesh recalculate-normals

mesh undo
mesh redo
mesh apply
mesh cancel
```

## Limites deliberados

A representação persistente continua triangular e não mantém polígonos de mais de três lados como entidades independentes. Materiais por face, grupos de suavização, UVs por canto, bevel, knife, loop/ring cut, bridge entre contornos de cardinalidades diferentes e remalhamento isotrópico ainda exigem extensões próprias. O núcleo atual foi desenhado para que essas extensões não precisem duplicar seleção, histórico, preview, snapping ou transformação procedural.
