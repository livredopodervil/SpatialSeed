# 0052b — compatibilidade de ocorrências do InstanceGraph e escala por bounds

Build: `20260807-0052b`

## Motivo

O 0052a compactou estruturas em um DAG de definições, mas alguns consumidores
continuaram assumindo que todo `objectId` selecionável existia em
`scene.objects`. Descendentes projetados existem somente como ocorrências
derivadas; por isso `delete`, Inspector, commits de transformação e edição de
geometria podiam falhar ou tornar-se no-op.

A correção não rematerializa os descendentes. Ela introduz uma identidade
operacional de ocorrência e mantém o DAG como autoridade.

## Identidade de ocorrência

Uma ocorrência projetada usa:

```text
@ig/<rootInstanceId>/<slotId>/<slotId>/...
```

O ID é uma identidade de runtime. O documento persiste:

- a instância raiz;
- o caminho de slots;
- overrides locais do caminho;
- definições imutáveis compartilhadas.

Não persiste uma cópia expandida do descendente.

## Semântica das operações

### Delete

- raiz autoritativa: remove uma instância raiz;
- descendente projetado: grava `hidden:true` no override daquele caminho;
- irmãos e outras instâncias da mesma definição permanecem intactos;
- undo restaura a mesma ocorrência.

### Inspector / propriedades

O Sandbox resolve a ocorrência pelo `rootId + instancePath`. O Inspector lê a
definição compartilhada mais overrides e escreve somente no override do caminho.
A projeção invalida somente a ocorrência atingida.

### Transformações

Transformações locais de um descendente são armazenadas como override do caminho.
Transformações mundiais são convertidas para o frame local do pai antes do
commit. Nenhum descendente é inserido em `scene.objects`.

### Geometria / edição de malha

`object.geometry.replace` em uma ocorrência é copy-on-write:

1. a definição geométrica original continua compartilhada pelos irmãos;
2. uma nova definição imutável é criada somente para o descendente divergente;
3. o caminho recebe um override `ref` para essa nova definição;
4. a raiz continua sendo o único objeto autoritativo da estrutura.

## Projection cache

Mudanças em ocorrências publicam `affectedOccurrenceIds` e
`occurrenceChanges`. `InstanceGraphProjectionCache` sincroniza somente a
ocorrência ou subárvore atingida. Há fallback para reprojeção da raiz quando uma
mudança antiga não possui metadata de ocorrência.

## Escala local por bounds

`LocalBoundsScale.js`, que existia mas não estava conectado ao renderer, volta a
ser usado por `ThreeRegionRenderer`.

No modo Scale:

- bounds local da seleção gera handles nos cantos;
- volumes 3D geram 8 handles diagonais/cantos;
- geometrias planas geram 4 handles;
- o handle oposto é o pivô padrão;
- Alt alterna entre pivô oposto e centro;
- o preview preserva TRS sem introduzir shear;
- handles permanecem pickáveis independentemente de estarem visualmente atrás da
  superfície, com ciclo entre candidatos sobrepostos.

O arraste por bounds mantém fator positivo. A operação de espelho por escala
negativa, introduzida no 0051a, continua disponível pelos comandos/transformação
que aceitam escala negativa; este incremento não redefine o gesto de atravessar
zero com o handle.

## Regressões anteriores verificadas

Os testes/auditorias de 0051b/0052a foram reexecutados para:

- save com `PersistentObjectArray`;
- seleção retangular e laço por bounds projetados;
- spatial shards;
- frustum culling local;
- índice espacial de picking;
- espelho por escala negativa;
- DAG acíclico e save compacto;
- overlays de animação independentes;
- previews sob demanda;
- runtime temporal event-driven;
- UI de edição de malha.

## Limites deliberados desta etapa

O DAG permanece acíclico. Autorreferência/IFS continua proibida.

Operações que **alteram a topologia estrutural interna** de um assembly
compactado — por exemplo duplicar um descendente como novo irmão, reagrupar
ocorrências internas ou reparentear uma ocorrência para outro assembly — ainda
exigem um modelo de override estrutural de arestas. Este incremento corrige
operações sobre ocorrências existentes; não simula uma alteração estrutural
materializando folhas.

Duplicar uma **instância raiz de estrutura** continua sendo apenas
`definitionId + transform`, como no 0052a.
