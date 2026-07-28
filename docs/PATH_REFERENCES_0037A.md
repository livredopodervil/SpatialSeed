# Referências espaciais e ferramentas por caminho — build 0037a

## Objetivo

O build `0037a` permite usar um objeto existente como parâmetro geométrico de
outra operação. O objeto pode fornecer um caminho, um perfil planar ou um ponto,
sem transferir autoridade ao renderer e sem criar uma dependência oculta entre
os objetos.

As primeiras ferramentas são:

- tubo ao longo de caminho;
- varredura de perfil ao longo de caminho;
- distribuição de uma seleção hierárquica ao longo de caminho;
- inspeção explícita da referência antes da operação.

As referências desta versão são **snapshots**. A geometria mundial é resolvida
no instante da execução e copiada para o resultado. Alterar depois o objeto de
origem não modifica automaticamente o tubo, a varredura ou a distribuição.

## Arquitetura

```text
objeto ou seleção
      ↓
SpatialReferenceResolver
      ↓
PathReference / ProfileReference / PointReference
      ↓
PathToolService
      ↓
comando editorial atômico
      ↓
reducer e histórico do sandbox
```

O pacote `packages/spatial-references` contém somente resolução, matemática e
serviços. O painel, o console e futuros agentes chamam os mesmos comandos
registrados em `packages/editor-commands`.

## Referências

Uma referência de caminho possui a forma conceitual:

```js
{
  kind: "path",
  objectId: "...",
  extraction: "centerline" | "boundary" | "loose-edges",
  points: [[x, y, z], ...],
  closed: false,
  sourceRevision: 42
}
```

Um perfil possui pontos bidimensionais em um frame planar ortonormal, além de
origem, eixos e normal mundiais. Um ponto pode ser extraído da origem ou do
pivô mundial do objeto.

### Extrações de caminho

- `centerline`: usa uma linha central declarada, atualmente disponível para a
  geometria `tube`;
- `boundary`: usa o maior ciclo de contorno de uma superfície aberta;
- `loose-edges`: ordena uma cadeia simples formada por arestas sem faces;
- `selection-origins`: usa os pivôs dos objetos selecionados na ordem editorial.

Sólidos fechados não aparecem como caminhos apenas por possuírem arestas. Isso
evita converter silenciosamente uma caixa ou esfera em uma trajetória ambígua.

### Extrações de perfil

- `contour`: usa o contorno declarado de `shape` ou `extrude`;
- `boundary`: usa o maior contorno de uma superfície aberta e verifica sua
  planaridade.

Perfis com furos ainda são rejeitados explicitamente. Eles exigem persistência
de múltiplos contornos e triangulação correspondente durante a varredura.

## Matemática

### Espaço mundial

Os pontos locais do objeto são transformados pela matriz mundial completa da
hierarquia. Portanto, translação, rotação, escala não uniforme e ancestrais são
considerados antes da operação.

### Cadeias de arestas

Uma cadeia válida tem grau máximo dois em cada vértice. Uma cadeia aberta deve
ter exatamente dois vértices de grau um; um ciclo não possui extremidades. A
ordenação percorre cada aresta uma única vez e rejeita ramificações ou
componentes desconectados.

### Perfil planar

A normal inicial é calculada pelo método de Newell. Os pontos são projetados em
uma base ortonormal do plano e o desvio máximo é comparado a uma tolerância
relativa à diagonal do perfil. O contorno é orientado no sentido positivo antes
da triangulação.

### Frames de transporte paralelo

A varredura não usa diretamente o frame de Frenet, que pode girar bruscamente
em regiões de baixa curvatura ou inflexão. Entre tangentes consecutivas, o frame
é transportado pela rotação mínima que leva uma tangente à seguinte. Em
caminhos fechados, o erro angular da costura é distribuído pelos anéis. Uma
torção adicional pode ser aplicada progressivamente.

Para um ponto bidimensional do perfil `(u, v)`, o vértice mundial no anel `i` é
obtido por:

```text
p(i,u,v) = cᵢ + sᵢ(u nᵢ + v bᵢ)
```

onde `cᵢ` é o centro do caminho, `nᵢ` e `bᵢ` são normal e binormal transportadas,
e `sᵢ` é a escala interpolada entre os extremos.

## Interface

No painel único **Editar**, a seção **Caminhos** permite escolher:

- objeto e método de extração do caminho;
- objeto e método de extração do perfil;
- caminho aberto ou fechado;
- raio e resolução do tubo;
- torção, escalas inicial/final e tampas da varredura;
- número de cópias e alinhamento pela tangente;
- inclusão opcional do próprio objeto-caminho na distribuição.

As ferramentas ficam desativadas durante uma sessão transitória de edição de
malha. A sessão deve ser aplicada ou cancelada antes de criar objetos no
sandbox.

## Console

```text
path list
path inspect object=id extraction=auto
path tube object=id radius=0.25 segments=64 radial=8
path sweep path=id profile=id segments=32 twist=0 caps=on
path array object=id count=8 align=on
```

Também são aceitos:

```text
path tube object=name:Caminho
path tube object=@selection-origins
```

O nome precisa resolver exatamente um objeto.

## Comandos públicos

```text
path.reference.inspect
path.tube.create
path.sweep.create
path.array.create
```

Consultas:

```text
path.references.list
path.reference.inspect
```

Capability:

```text
pathReferences
```

## Atomicidade e hierarquia

Tubo e varredura criam um objeto por comando. A distribuição clona subárvores
inteiras, calcula as matrizes mundiais desejadas para cada cópia e grava todas
as cópias em um único comando `selection.duplicate`. Um undo remove a operação
completa.

## Limites deliberados

- referências são snapshots, não modificadores vinculados;
- não há ainda objetos `curve` ou `polyline` de primeira classe;
- perfis com furos não são varridos;
- não há loft entre perfis nem variação procedural do perfil por anel;
- não há seleção de uma cadeia de arestas ainda não aplicada como referência
  externa;
- a varredura gera uma malha triangular `buffer`; editar o caminho de origem
  depois não a recalcula.

Referências vinculadas devem ser introduzidas somente com um grafo explícito de
modificadores, detecção de ciclos, invalidação incremental e política clara de
persistência.

## Testes

```text
runtime test path-references
runtime test all
```

O roteiro visual mínimo é:

1. criar ou selecionar um tubo e usá-lo como caminho de outro tubo;
2. criar uma forma plana e varrê-la pelo caminho;
3. selecionar um objeto diferente e distribuí-lo pelo mesmo caminho;
4. desfazer cada operação e verificar atomicidade;
5. transformar o objeto-caminho e repetir, confirmando o uso do espaço mundial;
6. alterar o caminho após a criação e confirmar a semântica de snapshot.
