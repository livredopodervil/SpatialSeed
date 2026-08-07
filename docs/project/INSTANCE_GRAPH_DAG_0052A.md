# 0052a — InstanceGraph acíclico e compartilhamento estrutural

## Objetivo

O 0052a troca a semântica de duplicação de uma cena plana por um grafo de
instâncias com compartilhamento estrutural. A primeira etapa é deliberadamente
acíclica. Uma definição ainda não pode referenciar a si própria; isso fica para
a próxima etapa, quando houver uma política explícita de término por
profundidade, erro ou tamanho projetado.

A regra central é:

> uma cópia é `referência + transformação`; uma cópia de uma estrutura é
> `referência da estrutura + transformação`.

Nenhuma cópia deve duplicar geometria ou expandir novamente uma estrutura já
definida.

## Modelo persistente

O documento passa ao `schemaVersion: 4` e pode conter:

```js
scene.instanceGraph = {
  version: "instance-graph-v1",
  definitions: {
    "object:box": {
      id: "object:box",
      type: "object",
      prototypeId: "box",
      object: { /* geometria/aparência imutáveis, sem transform */ }
    },
    "assembly:chair": {
      id: "assembly:chair",
      type: "assembly",
      children: [
        { slotId: "slot:0", ref: "object:box", transform: M0 },
        { slotId: "slot:1", ref: "object:box", transform: M1 }
      ]
    }
  }
}
```

As ocorrências de topo são leves:

```js
{
  id: "chair-27",
  kind: "instance",
  definitionId: "assembly:chair",
  position,
  rotation,
  scale,
  overrides
}
```

## Crescimento

Se `S` possui `K` arestas internas e há `N` cópias de `S`, o documento usa
aproximadamente `K + N` transformações, não `K*N` objetos materializados.

Exemplo:

- `A`: uma definição geométrica;
- `B`: 10 referências a `A`;
- `C`: 20 referências a `B`;
- 100 cópias de `C`.

A cena visual representa 20.000 folhas `A`, mas o grafo persistente armazena
10 + 20 + 100 transformações, além das três definições.

## Dividir e conquistar

As definições de assembly formam um DAG. Uma instância pode apontar para uma
definição que, por sua vez, aponta para outras definições. O renderer recebe
uma projeção derivada somente para a execução; essa projeção nunca é salva.

Isso prepara três otimizações hierárquicas:

1. culling por bounds da instância/assembly antes de visitar filhos;
2. picking transformando o raio para o espaço local e reutilizando o mesmo
   índice interno da definição;
3. expansão somente das folhas visíveis/relevantes.

O 0052a estabelece o modelo de dados e a projeção. O índice espacial e os
spatial shards existentes continuam sendo caches derivados do renderer.

## Duplicação

`SelectionOperations` usa `selection.duplicate-reference`.

Na primeira duplicação de um objeto legado:

1. o objeto fonte é internado numa definição;
2. a fonte vira uma instância leve;
3. cada cópia é apenas outra instância apontando para a mesma definição.

Para um grupo/estrutura, a compactação cria uma definição `assembly`. Ao
duplicar a estrutura, nenhum descendente é copiado no estado autoritativo.

## Agrupamento recursivo

Agrupar instâncias de uma estrutura cria outro assembly cujas arestas apontam
para a definição da estrutura anterior. Portanto, `assembly` pode conter
`assembly` sem materialização das folhas.

Ciclos são rejeitados em 0052a:

```text
Ciclo de definição ainda não permitido
```

## Delete

`selection.delete` remove a instância de topo/aresta autoritativa. Descendentes
projetados não precisam existir no documento. A mudança também carrega o
objeto removido para manter índices incrementais coerentes.

A seleção visual de uma folha de um assembly continua promovida para a unidade
de seleção da instância de topo. Edição interna persistente será aprofundada
com overrides por `instancePath`; a infraestrutura de overrides já existe, mas
nesta etapa o fluxo seguro para desmontar uma estrutura é `ungroup`.

## Ungroup

Desagrupar uma instância de assembly materializa **um nível** de arestas como
novas instâncias leves. Geometria não é copiada. Se um filho referencia outro
assembly, ele continua sendo apenas uma instância desse assembly.

## Edição e copy-on-write

Transformações alteram somente a instância.

Propriedades locais são guardadas em `overrides.$self` quando o alvo é uma
instância. A definição compartilhada permanece inalterada.

Uma substituição estrutural da geometria cria uma nova definição de objeto e
retargeta somente aquela instância. Esse é copy-on-write no ramo divergente,
não cópia da árvore inteira.

## Save/Open

`ProjectSerializer` compacta todos os roots não câmera/luz antes de salvar e
escreve `schemaVersion: 4`. Assim, projetos antigos com milhares de duplicatas
planas ficam compactos já no primeiro save após a atualização.

`ProjectValidator` continua aceitando schemas 1, 2 e 3. Eles permanecem
compatíveis em memória e migram para o grafo no próximo save/duplicação/grupo.

O arquivo salvo contém definições e instâncias, nunca a projeção expandida do
renderer.

## Renderer

`SceneProjectionScheduler` projeta o `InstanceGraph` para a cena plana esperada
pelos subsistemas legados. IDs internos projetados têm prefixo `@ig:` e um
`instancePath`; são cache de execução.

Uma transformação simples de uma instância pode seguir incremental. Criar ou
remover uma instância de assembly força uma reprojeção completa nesta primeira
etapa para garantir criação/remoção correta das folhas derivadas.

## Diagnóstico

No console:

```text
runtime query instance.graph.status
```

Campos principais:

- `definitionCount`;
- `objectDefinitions`;
- `assemblyDefinitions`;
- `edgeCount`;
- `rootInstanceCount`;
- `legacyObjectCount`;
- `authoritativeObjectCount`.

Após duplicar muitas cópias do mesmo objeto, `objectDefinitions` deve continuar
1. Após duplicar uma estrutura, `assemblyDefinitions` também deve permanecer
constante enquanto `rootInstanceCount` cresce.

## Limite deliberado do 0052a

Não há autorreferência ainda. `A -> A` e ciclos indiretos como `A -> B -> A`
são inválidos. A próxima etapa poderá permitir referências recursivas com uma
política explícita de término e expansão lazy por tamanho de tela/LOD.

## Localidade de atualização

A projeção derivada possui `InstanceGraphProjectionCache`. Em alterações
incrementais comuns ela não percorre o grafo inteiro:

- transformar uma instância folha reprojeta exatamente uma folha;
- transformar uma instância de assembly reprojeta somente o envelope raiz;
- os filhos mantêm seus transforms locais imutáveis;
- criação/remoção estrutural atualiza apenas o segmento derivado da instância;
- mudanças que alteram a topologia global ainda podem solicitar uma projeção
  completa como caminho conservador.

`HierarchyIndex.updateNode()` invalida somente a matriz mundial do nó alterado
e de seus descendentes. O renderer usa esse caminho para transformações em
hierarquias estáveis, evitando reconstruir o `HierarchyIndex` da cena inteira.
Assim, mover uma folha custa O(1) no modelo/projeção; mover uma estrutura custa
O(K) para atualizar as K folhas renderizadas dessa estrutura, e não O(N) para
visitar a cena inteira. Remover esse O(K) visual exigirá, numa etapa posterior,
transformação hierárquica na GPU ou expansão recursiva lazy.

Diagnóstico adicional:

```text
runtime query instance.graph.projection
runtime query performance.locality.diagnostics
```

`instance.graph.projection.statistics.projectedObjectsVisited` deve crescer em
1 quando apenas uma instância folha ou o transform raiz de um assembly muda.
