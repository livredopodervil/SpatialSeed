# Especificação do formato `.spatialseed`

> Especificação normativa P0. Auditada em 16 de julho de 2026. Formato de
> escrita atual: `spatial-seed`, schema 2. O leitor também aceita schema 1.

## 1. Escopo

Um arquivo `.spatialseed` representa um projeto editorial: cena, hierarquia,
assets, estado relevante do editor e configuração de transformação do renderer.
Ele não contém o catálogo de procedimentos, cache da PWA, preferências de UI ou
sessão privada do runtime de programas.

As palavras **DEVE**, **NÃO DEVE**, **DEVERIA** e **PODE** são normativas no
sentido do BCP 14.

## 2. Identificação e transporte

| Propriedade | Valor atual |
| --- | --- |
| extensão | `.spatialseed` |
| representação | JSON |
| encoding | UTF-8 |
| media type usado pela aplicação | `application/json;charset=utf-8` |
| `format` | `spatial-seed` |
| schema escrito | `2` |
| schemas lidos | `1`, `2` |

O tipo MIME ainda não é registrado na IANA. Integrações externas DEVERIAM
reconhecer primeiro `format` e `schemaVersion`, não apenas extensão ou MIME.

## 3. Envelope de schema 2

```js
{
  format: "spatial-seed",
  schemaVersion: 2,
  metadata: { name, createdAt, savedAt },
  region: { descriptor, version },
  assets: { schemaVersion: 1, assets: { [contentId]: assetRecord } },
  scene: { schemaVersion: 1, objects: [...] },
  editor: { ... },
  renderer: { transformConfig: { ... } }
}
```

Campos desconhecidos PODEM ser preservados por ferramentas externas, mas o
leitor atual não promete roundtrip para extensões fora de `scene`. Uma extensão
normativa futura DEVE elevar versão ou declarar namespace próprio.

## 4. Metadados

| Campo | Tipo | Regra |
| --- | --- | --- |
| `name` | string | nome humano; default `Projeto Spatial Seed` |
| `createdAt` | string | timestamp ISO 8601 de criação |
| `savedAt` | string | timestamp ISO 8601 gerado a cada serialização |

O leitor atual tolera metadados ausentes. Escritores conformes DEVEM emitir os
três campos e usar timestamps válidos.

O nome de download é normalizado para NFKD, sem diacríticos e com caracteres
fora de `[A-Za-z0-9._-]` substituídos por `-`.

## 5. Região

`region.descriptor` descreve a região associada ao serializer, e
`region.version` registra sua versão no momento de salvar. No loader atual,
esses dados são informativos: abrir um projeto não substitui a região runtime já
construída.

Ferramentas NÃO DEVEM presumir que `region.version` é igual à revisão do sandbox
ou a `schemaVersion` da cena.

## 6. Cena

### 6.1 Envelope

```js
{
  schemaVersion: 1,
  objects: [SceneNode, ...]
}
```

`objects` DEVE ser array. Cada nó DEVE possuir `id` textual não vazio e único em
toda a cena.

### 6.2 Transform local

Todo nó DEVE usar TRS local:

```js
{
  position: [x, y, z],
  rotation: [x, y, z, w],
  scale: [sx, sy, sz]
}
```

- componentes DEVEM ser números finitos;
- `rotation` é quaternion;
- `scale` NÃO DEVERIA conter zero, pois reparenting e decomposição exigem matriz
  afim invertível;
- se `parentId` não for `null`, o transform é relativo ao pai;
- sem `parentId`, o transform é relativo ao mundo da região.

O transform mundial é o produto ordenado das matrizes locais dos ancestrais.

### 6.3 Objeto renderizável

Forma canônica:

```js
{
  id: "objeto-1",
  kind: "box",
  name: "Caixa 1",
  parentId: null,
  position: [0, 1, 0],
  rotation: [0, 0, 0, 1],
  scale: [1, 1, 1],
  geometry: { type: "box", size: [2, 2, 2] },
  appearanceId: "appearance:fnv1a64:...",
  instanceState: {}
}
```

Em schema 2, todo objeto cujo `kind` não seja `group` DEVE possuir
`appearanceId`. `material` embutido não é a representação canônica de schema 2.

`instanceState` guarda overrides por instância. O campo atualmente usado é
`color`; novos campos precisam de contrato de propriedade e serialização.

### 6.4 Grupo lógico

```js
{
  id: "grupo-1",
  kind: "group",
  name: "Grupo 1",
  parentId: null,
  position: [0, 0, 0],
  rotation: [0, 0, 0, 1],
  scale: [1, 1, 1],
  pivot: [0, 0, 0]
}
```

Grupo NÃO DEVE possuir geometria ou aparência obrigatória. Filhos apontam para
ele por `parentId`; o grupo não mantém array duplicado de filhos. Grupos podem
ser aninhados.

Uma hierarquia conforme DEVE satisfazer:

1. todo `parentId` referencia ID existente ou é `null`/ausente;
2. nenhum nó é seu próprio pai;
3. o grafo não contém ciclos;
4. cada nó tem no máximo um pai;
5. relações internas permanecem em transforms locais.

O `ProjectValidator` atual ainda não aplica toda essa lista; `HierarchyIndex`
aplica-a quando a hierarquia é usada. Escritores DEVEM obedecê-la mesmo assim.

## 7. Descritores geométricos

O campo `geometry.type` seleciona um provider. O registro padrão contém:

| Tipo | Topologia | Parâmetros canônicos |
| --- | --- | --- |
| `box` | sólido fechado | `size: [x,y,z]`, todos positivos |
| `sphere` | sólido fechado | `radius > 0`, `widthSegments >= 3`, `heightSegments >= 2` |
| `cylinder` | sólido fechado | `radiusTop >= 0`, `radiusBottom >= 0`, `height > 0`, `radialSegments >= 3`, `heightSegments >= 1`, `openEnded` |
| `plane` | superfície aberta | `width > 0`, `height > 0`, segmentos >= 1 |
| `polygon` | superfície aberta | `sides >= 3`, `radius > 0`, `startAngleDeg` normalizado em `[0,360)` |

Superfícies abertas são renderizadas em ambos os lados; sólidos fechados usam
face frontal por padrão. O `GeometryRegistry` é a fonte autoritativa para tipos
instalados, defaults, normalização e chave de compartilhamento.

Objetos antigos do tipo caixa podem usar `size` diretamente sem `geometry`. O
registro ainda descreve essa forma como compatibilidade legada; novos escritores
DEVEM emitir `geometry`.

## 8. Assets e aparências

### 8.1 Catálogo

```js
{
  schemaVersion: 1,
  assets: {
    "kind:fnv1a64:hash": {
      kind: "texture" | "material" | "appearance",
      value: { ... },
      metadata: { ... },
      references: 0
    }
  }
}
```

Cada chave é um content ID calculado sobre a representação canônica de `value`:

```text
<kind>:fnv1a64:<16 dígitos hexadecimais>
```

A canonicalização:

- ordena chaves de objetos;
- preserva ordem de arrays;
- rejeita números não finitos, `undefined`, função, símbolo e ciclos;
- normaliza `-0` para `0`;
- representa `BigInt`, datas, ArrayBuffer e typed arrays de forma explícita.

Ao importar, o reader DEVE recalcular o ID e rejeitar divergência. FNV-1a é
identificação de conteúdo e deduplicação, não hash criptográfico.

### 8.2 Textura

Valor normalizado:

```js
{
  src: "data:image/png;base64,...",
  mimeType: "image/png",
  colorSpace: "srgb",
  flipY: true,
  metadata: {}
}
```

`src` pode conter Base64 e portanto dominar o tamanho do arquivo. Texturas
idênticas são internadas uma vez no mesmo catálogo.

### 8.3 Material

```js
{
  model: "standard",
  color: "#6699cc",
  opacity: 1,
  transparent: false,
  textureId: null,
  textureTransform: {
    repeat: [1, 1],
    offset: [0, 0],
    rotationDeg: 0,
    wrap: "repeat"
  },
  parameters: {}
}
```

Transform UV pertence ao material. Assim, dois objetos podem compartilhar a
textura e usar materiais distintos.

### 8.4 Aparência

```js
{
  materialId: "material:fnv1a64:...",
  shaderId: null,
  renderState: {},
  metadata: {}
}
```

Relações conformes:

```text
objeto -> appearance -> material -> textura opcional
```

Todo ID referenciado DEVE existir e possuir o `kind` esperado. `references`
DEVERIA refletir as retenções do grafo, mas não substitui a validação das arestas.

## 9. Editor e renderer

`editor` conserva somente estado restaurável do editor, incluindo ferramenta,
seleção múltipla e política de pivô. A seleção de objetos não é restaurada ao
abrir: ela é limpa antes da configuração.

Políticas de pivô aceitas hoje:

- `median`, `bounds`, `active`;
- `custom` com referência `absolute` e `customPosition`;
- `custom` com referência `active-relative` e `relativeOffset`.

`renderer.transformConfig` guarda configuração do gizmo. Recursos WebGL,
caches, meshes e bounds derivados NÃO pertencem ao arquivo.

## 10. Exemplo mínimo importável de schema 2

```json
{
  "format": "spatial-seed",
  "schemaVersion": 2,
  "metadata": {
    "name": "Exemplo mínimo",
    "createdAt": "2026-07-16T12:00:00.000Z",
    "savedAt": "2026-07-16T12:00:00.000Z"
  },
  "region": {},
  "assets": {
    "schemaVersion": 1,
    "assets": {
      "material:fnv1a64:3a7207e125192aa9": {
        "kind": "material",
        "value": {
          "model": "standard",
          "color": "#6699cc",
          "opacity": 1,
          "transparent": false,
          "textureId": null,
          "textureTransform": {
            "repeat": [1, 1],
            "offset": [0, 0],
            "rotationDeg": 0,
            "wrap": "repeat"
          },
          "parameters": {}
        },
        "metadata": {},
        "references": 1
      },
      "appearance:fnv1a64:0805c98f9629a319": {
        "kind": "appearance",
        "value": {
          "materialId": "material:fnv1a64:3a7207e125192aa9",
          "shaderId": null,
          "renderState": {},
          "metadata": {}
        },
        "metadata": {},
        "references": 1
      }
    }
  },
  "scene": {
    "schemaVersion": 1,
    "objects": [
      {
        "id": "box-1",
        "kind": "box",
        "name": "Caixa 1",
        "position": [0, 1, 0],
        "rotation": [0, 0, 0, 1],
        "scale": [1, 1, 1],
        "geometry": { "type": "box", "size": [2, 2, 2] },
        "appearanceId": "appearance:fnv1a64:0805c98f9629a319",
        "instanceState": {}
      }
    ]
  },
  "editor": {},
  "renderer": {}
}
```

Os IDs acima correspondem exatamente aos valores mostrados. Alterar qualquer
valor exige recalcular seu content ID e atualizar referências.

## 11. Compatibilidade com schema 1

Schema 1 não exige `assets`; objetos podem conter `material` embutido:

```js
{
  format: "spatial-seed",
  schemaVersion: 1,
  scene: {
    schemaVersion: 1,
    objects: [{
      id: "legacy-box",
      kind: "box",
      position: [0, 1, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
      size: [2, 2, 2],
      material: { color: "#6699cc" }
    }]
  }
}
```

Ao abrir, materiais legados são internados no grafo de aparências. O próximo
save escreve schema 2. Não existe downgrade automático de schema 2 para 1.

## 12. Processo de leitura

O reader atual executa, em ordem:

1. `JSON.parse`;
2. validação do envelope e objetos;
3. reset do runtime de aparências;
4. importação dos assets de schema 2;
5. normalização da cena;
6. `sandbox.replaceState(..., {markClean:true})`;
7. limpeza da seleção;
8. restauração do editor e transform config;
9. atualização dos metadados do projeto.

Como o reset de aparências ocorre antes de toda a normalização, leitores futuros
DEVERIAM validar integralmente em uma estrutura temporária e só então trocar o
estado ativo. Essa é uma lacuna de robustez a resolver.

## 13. Erros obrigatórios

O reader DEVE rejeitar, sem aceitar parcialmente:

- JSON inválido;
- `format` diferente;
- schema desconhecido;
- `scene.objects` ausente ou não-array;
- catálogo de assets incompatível em schema 2;
- objeto não-objeto, ID vazio ou duplicado;
- objeto renderizável sem `appearanceId` em schema 2;
- content ID incompatível;
- valor de asset não canônico ou não serializável;
- referência inexistente ou de `kind` incorreto;
- hierarquia cíclica ou pai ausente;
- geometria desconhecida ou parâmetros inválidos;
- transform não finito ou não representável.

Os primeiros sete itens são amplamente implementados hoje; os demais definem o
alvo normativo que ainda precisa ser incorporado ao `ProjectValidator`.

## 14. Limites e segurança de recursos

O formato atual não define máximos de bytes, objetos, assets, Base64 ou
profundidade. Um reader exposto a arquivos de terceiros DEVERIA impor cotas
antes da alocação pesada e relatar qual cota foi excedida.

Proposta para uma futura revisão, ainda **não implementada**:

- checagem de tamanho antes de `JSON.parse`;
- limite configurável de objetos e assets;
- limite de profundidade de hierarquia;
- limite por textura e soma de texturas;
- validação completa em staging;
- relatório de migração sem stack trace bruto.

## 15. Roundtrip e determinismo

Um roundtrip conforme preserva cena, hierarquia, descritores, referências de
aparência, editor restaurável e transform config. `savedAt`, ordem de campos e
contadores internos podem mudar.

Content IDs devem ser estáveis para o mesmo valor canônico. Ordem do objeto JSON
de entrada não deve afetar o ID; ordem de arrays afeta.

O arquivo atualmente expande cada objeto procedural. Grupos também não são um
formato de compactação. Instancing reduz custo de render, mas não implica uma
representação compacta no documento. Um formato futuro de protótipo + instâncias
exigirá nova versão e migração explícita.

## 16. Política de evolução

1. mudanças compatíveis dentro do schema só podem adicionar campos opcionais;
2. mudança de significado, campo obrigatório ou representação exige nova
   `schemaVersion`;
3. reader novo DEVERIA aceitar ao menos a versão imediatamente anterior;
4. writer escreve apenas a versão canônica atual;
5. migração DEVE ser determinística, testada e nunca sobrescrever o arquivo de
   origem sem ação do usuário;
6. versão de arquivo é independente de build, versão do produto, protocolo de
   Worker e versão de catálogo.

## 17. Referências

- [RFC 8259: The JavaScript Object Notation Data Interchange Format](https://www.rfc-editor.org/rfc/rfc8259)
- [WHATWG HTML: structured cloning](https://html.spec.whatwg.org/multipage/structured-data.html)
- [IETF BCP 14: palavras normativas](https://www.rfc-editor.org/info/bcp14/)
- [`PROJECT_ASSETS_0018F.md`](PROJECT_ASSETS_0018F.md)
- [`GROUP_MODEL_DRAFT.md`](GROUP_MODEL_DRAFT.md), histórico; não substitui esta especificação

## 18. Fontes no repositório

- `packages/project-files/src/ProjectSerializer.js`
- `packages/project-files/src/ProjectValidator.js`
- `packages/project-files/src/ProjectService.js`
- `packages/asset-store/src/AssetStore.js`
- `packages/asset-store/src/CanonicalValue.js`
- `packages/asset-store/src/ContentId.js`
- `packages/appearance-graph/src/`
- `packages/geometry-registry/src/`
- `packages/scene-hierarchy/src/`
